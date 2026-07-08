const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONEXIÓN A MONGODB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Bóveda de MongoDB conectada'))
    .catch(err => console.error('❌ Error en MongoDB:', err));

// 2. MODELO DE DATOS (Lo que vamos a guardar)
const progressSchema = new mongoose.Schema({
    userId: { type: String, default: 'montse_0710', unique: true }, // Identificador único
    openedWeeks: { type: [Number], default: [] }, // Arreglo de semanas abiertas [1, 2, 3]
    wonPrizes: { type: Object, default: {} }, // Objeto con los premios { "1": "Masaje", "3": "Café" }
    loginCount: { type: Number, default: 0 }, // <-- NUEVO: Contador total de visitas
    dailyQuiz: {                              // <-- NUEVO: Control del Quiz Diario
        lastPlayed: { type: String, default: "" },
        currentStreak: { type: Number, default: 0 },
        historial: { type: Array, default: [] } // <-- NUEVO: Aquí se guardarán todos los quizzes
    }
});
const Progress = mongoose.model('Progress', progressSchema);

// 3. API DE GEMINI (bienvenida)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/api/bienvenida', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { temperature: 0.85 }
        });
        const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
        const daysLeft = Math.ceil((new Date("2026-10-28") - new Date()) / (1000 * 60 * 60 * 24));
        const prompt = `Hoy es ${today}. Faltan ${daysLeft} días para nuestro aniversario. 
Actúa como un narrador melancólico y confidente secreto de una novela romántica pasional y gótica.
Genera un mensaje de bienvenida de máximo 50 palabras para mi novia. 
No uses su nombre; dirígete a ella usando obligatoriamente solo uno de estos apodos: Mi amor, Mi vida, Mi reina, Flaca, Princesa o Corazón.
Tono: Intelectual, poético, misterioso y coquetamente romántico.
Si faltan pocos días, muestra emoción contenida. No menciones que eres una IA.`;
        
        const result = await model.generateContent(prompt);
        res.json({ mensaje: result.response.text() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'El oráculo no responde' });
    }
});

// 4. API PARA SINCRONIZAR PROGRESO (Nuevas rutas)
// Leer progreso al iniciar sesión
app.get('/api/sync', async (req, res) => {
    try {
        let data = await Progress.findOne({ userId: 'montse_0710' });
        if (!data) data = await Progress.create({ userId: 'montse_0710' }); // Si no existe, lo crea vacío
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error leyendo bóveda' });
    }
});

// Guardar progreso nuevo (cuando abre tarjeta o gana ruleta/rasca)
app.post('/api/sync', async (req, res) => {
    try {
        const { openedWeeks, wonPrizes } = req.body;
        const data = await Progress.findOneAndUpdate(
            { userId: 'montse_0710' },
            { openedWeeks, wonPrizes },
            { returnDocument: 'after', upsert: true }
        );
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: 'Error guardando progreso' });
    }
});

// =========================================================
// 5. API PARA REGISTRAR VISITAS (NUEVO)
// =========================================================
app.post('/api/visita', async (req, res) => {
    try {
        const data = await Progress.findOneAndUpdate(
            { userId: 'montse_0710' },
            { $inc: { loginCount: 1 } }, 
            { returnDocument: 'after', upsert: true }
        );
        res.json({ success: true, totalVisitas: data.loginCount });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar la visita' });
    }
});

// =========================================================
// 6. API: GENERADOR DEL QUIZ DIARIO DE SINTONÍA (FIJO)
// =========================================================
app.get('/api/quiz-diario', async (req, res) => {
    try {
        const tzOffset = (new Date()).getTimezoneOffset() * 60000;
        const localISODate = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);

        let userProgress = await Progress.findOne({ userId: 'montse_0710' });
        if (!userProgress) userProgress = await Progress.create({ userId: 'montse_0710' });

        // 1. CÁLCULO VISUAL DE LA RACHA ACTUAL
        let rachaActiva = userProgress.dailyQuiz?.currentStreak || 0;
        const lastPlayedStr = userProgress.dailyQuiz?.lastPlayed;

        if (lastPlayedStr) {
            const fechaUltimoJuego = new Date(lastPlayedStr + "T00:00:00");
            const fechaHoy = new Date(localISODate + "T00:00:00");
            const diferenciaDias = (fechaHoy - fechaUltimoJuego) / (1000 * 60 * 60 * 24);

            // Si han pasado más de 1 día desde la última vez que jugó, visualmente la racha está en 0
            if (diferenciaDias > 1) {
                rachaActiva = 0;
            }
        }

        // 2. CONTROL DE BLOQUEO: ¿Ya jugó hoy?
        if (lastPlayedStr === localISODate) {
            const historial = userProgress.dailyQuiz.historial || [];
            const registroDeHoy = historial.length > 0 ? historial[historial.length - 1] : {};

            return res.json({
                alreadyPlayed: true,
                currentStreak: rachaActiva, // Usamos la racha calculada
                categoria: registroDeHoy.categoria || "Complicidad",
                pregunta: registroDeHoy.pregunta || "¡Ya respondiste el dilema de hoy!",
                respuestaElegida: registroDeHoy.respuesta || ""
            });
        }

        // 3. SI ES DÍA NUEVO: Generamos la pregunta con IA
        const categorias = ["Romántica", "Divertida / Cómplice", "Erótica / Atrevida"];
        const indiceAleatorio = Math.floor(Math.random() * categorias.length);
        const categoriaDelDia = categorias[indiceAleatorio];

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", // Asegúrate de tener el modelo correcto aquí
            systemInstruction: "Actúas estrictamente como una API que genera desafíos de sintonía para parejas en formato JSON. Tu tono interno debe reflejar un narrador cómplice, audaz, sumamente ingenioso y con picardía, ideal para una pareja joven. No hables, no saludes, no uses Markdown. Tu salida debe ser única y exclusivamente el objeto JSON.",
            generationConfig: { 
                maxOutputTokens: 250, 
                temperature: 0.85,
                responseMimeType: "application/json" 
            }
        });

        const prompt = `Genera un objeto JSON para la categoría: "${categoriaDelDia}".
        La pregunta debe plantear un escenario hipotético, ingenioso o coqueto sobre una relación, con opciones divertidas, ocurrentes o provocativas.
        
        Estructura exacta requerida:
        {
          "categoria": "${categoriaDelDia}",
          "pregunta": "Texto de la pregunta aquí",
          "opciones": ["Opción A", "Opción B", "Opción C"]
        }
        
        Reglas: No uses nombres propios (usa Mi Amor, Corazón o Mi Vida). Máximo 3 opciones.`;

        const result = await model.generateContent(prompt);
        const respuestaTexto = result.response.text().trim();

        const jsonMatch = respuestaTexto.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new SyntaxError("No se encontró estructura JSON válida.");
        }

        const dataQuiz = JSON.parse(jsonMatch[0]); 

        res.json({
            alreadyPlayed: false,
            currentStreak: rachaActiva, // Usamos la racha calculada antes de que juegue
            ...dataQuiz
        });

    } catch (error) {
        console.error("Error al generar el Quiz:", error);
        res.status(500).json({ error: 'El destino se ha nublado momentáneamente.' });
    }
});

// Endpoint para salvar el quiz, aumentar racha y verificar hitos de recompensa
app.post('/api/quiz-completar', async (req, res) => {
    try {
        const ahora = new Date();
        const tzOffset = ahora.getTimezoneOffset() * 60000;
        const localISODate = (new Date(ahora - tzOffset)).toISOString().slice(0, 10);
        
        const horaLocal = ahora.toLocaleTimeString('es-MX', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });

         const { categoria, pregunta, respuesta } = req.body;

        // 1. Buscamos el progreso actual
        let progress = await Progress.findOne({ userId: 'montse_0710' });
        if (!progress) progress = await Progress.create({ userId: 'montse_0710' });

        // 2. LÓGICA DE CONTROL DE RACHA (STREAK SYSTEM)
        let nuevaRacha = 1; // Si es su primer juego o rompió la racha, vuelve a 1
        const lastPlayedStr = progress.dailyQuiz?.lastPlayed;

        if (lastPlayedStr) {
            // Forzamos la hora a medianoche (T00:00:00) para evitar desfases de zona horaria
            const fechaUltimoJuego = new Date(lastPlayedStr + "T00:00:00");
            const fechaHoy = new Date(localISODate + "T00:00:00");
            
            // Calculamos la diferencia exacta en días
            const diferenciaMilisegundos = fechaHoy - fechaUltimoJuego;
            const diferenciaDias = diferenciaMilisegundos / (1000 * 60 * 60 * 24);

            if (diferenciaDias === 1) {
                // ¡Jugó ayer! Mantuvo la sintonía, sumamos 1 a la racha
                nuevaRacha = (progress.dailyQuiz.currentStreak || 0) + 1;
            } else if (diferenciaDias > 1) {
                // Dejó pasar más de un día. La racha se rompe y regresa a 1.
                nuevaRacha = 1;
            } else if (diferenciaDias === 0) {
                // Caso de seguridad: Jugó el mismo día (la racha no cambia)
                nuevaRacha = progress.dailyQuiz.currentStreak || 1;
            }
        }

        let premioDesbloqueado = null;
        
        // Construimos el objeto de actualización usando nuestra nueva variable matemática
        let updateFields = {
            "dailyQuiz.lastPlayed": localISODate,
            "dailyQuiz.currentStreak": nuevaRacha
        };

        // 3. SISTEMA DE HITOS: Si alcanza rachas perfectas, le regalamos un cupón secreto
        if (nuevaRacha === 6) {
            premioDesbloqueado = "🎟️ Cupón de Racha: Un tierno beso de 10 segundos donde tú elijas.";
            updateFields["wonPrizes.racha_6"] = premioDesbloqueado;
        } else if (nuevaRacha === 15) {
            premioDesbloqueado = "🍿 Cupón de Racha: Una tarde de películas donde yo invito todos los snacks que quieras.";
            updateFields["wonPrizes.racha_15"] = premioDesbloqueado;
        } else if (nuevaRacha === 25) {
            premioDesbloqueado = "🔥 Cupón de Racha: Ojos bendados, manos atadas, música suave, velas y mis labios recorriendo tu piel.";
            updateFields["wonPrizes.racha_25"] = premioDesbloqueado;
        } else if (nuevaRacha === 40) {
            premioDesbloqueado = "✨ Cupón de Racha Suprema: Pase para una cita romántica preparada por mí.";
            updateFields["wonPrizes.racha_40"] = premioDesbloqueado;
        }

        // 3. Ejecutamos la actualización completa en MongoDB
        const data = await Progress.findOneAndUpdate(
            { userId: usuario },
            { 
                $set: updateFields,
                $push: { "dailyQuiz.historial": { fecha: localISODate, hora: horaLocal, categoria, pregunta, respuesta } }
            }, 
            { returnDocument: 'after', upsert: true }
        );

        res.json({ 
            success: true, 
            racha: nuevaRacha,
            premioDesbloqueado: premioDesbloqueado // Le avisamos al frontend si ganó algo
        });

    } catch (error) {
        console.error("Error en quiz-completar:", error);
        res.status(500).json({ error: 'Error al procesar el quiz.' });
    }
});


// =========================================================
// INICIAR SERVIDOR
// =========================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`El Oráculo escucha en el puerto ${PORT}`));
