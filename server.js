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
        categoriaHoy: { type: String, default: "" }
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
            { new: true, upsert: true }
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
            { new: true, upsert: true }
        );
        res.json({ success: true, totalVisitas: data.loginCount });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar la visita' });
    }
});

// =========================================================
// 6. API: GENERADOR DEL QUIZ DIARIO DE SINTONÍA (OPTIMIZADO)
// =========================================================
app.get('/api/quiz-diario', async (req, res) => {
    try {
        // 1. Obtener la fecha de hoy local (Formato: YYYY-MM-DD)
        const tzOffset = (new Date()).getTimezoneOffset() * 60000;
        const localISODate = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);

        // 2. Buscar el progreso del usuario
        let userProgress = await Progress.findOne({ userId: 'montse_0710' });
        if (!userProgress) userProgress = await Progress.create({ userId: 'montse_0710' });

        // 3. CONTROL DE BLOQUEO: ¿Ya jugó hoy?
        if (userProgress.dailyQuiz && userProgress.dailyQuiz.lastPlayed === localISODate) {
            return res.json({
                alreadyPlayed: true,
                categoria: userProgress.dailyQuiz.categoriaHoy || "Complicidad",
                pregunta: "¡Ya respondiste el dilema de hoy! Vuelve mañana para un nuevo desafío.",
                opciones: []
            });
        }

        // 4. Si es un día nuevo, elegir categoría al azar
        const categorias = ["Romántica", "Divertida / Cómplice", "Erótica / Atrevida"];
        const indiceAleatorio = Math.floor(Math.random() * categorias.length);
        const categoriaDelDia = categorias[indiceAleatorio];

        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite",
            generationConfig: { 
                temperature: 0.85,
                responseMimeType: "application/json" 
            }
        });

        // TONO CORREGIDO: Menos gótico pesado, más divertido, ingenioso y audaz
        const prompt = `Actúa como un narrador cómplice, audaz, sumamente ingenioso y con un toque de picardía ideal para una pareja joven. 
        Evita sonar trágico, excesivamente poético o antiguo. Queremos frescura, juego y misterio moderno.
        Genera una pregunta de opción múltiple para mi novia basada estrictamente en la categoría: "${categoriaDelDia}".
        La pregunta debe plantear un escenario hipotético, ingenioso o coqueto sobre nuestra relación.
        
        Debes devolver un objeto JSON con la siguiente estructura exacta:
        {
          "categoria": "${categoriaDelDia}",
          "pregunta": "Texto de la pregunta aquí",
          "opciones": ["Opción A", "Opción B", "Opción C"]
        }
        
        Reglas estrictas: Las opciones deben ser divertidas, ocurrentes o provocativas. No uses nombres propios (usa Mi Amor, Corazón, Mi Vida). Máximo 3 opciones. No agregues texto fuera del objeto JSON.`;

        const result = await model.generateContent(prompt);
        const dataQuiz = JSON.parse(result.response.text());

        res.json({
            alreadyPlayed: false,
            ...dataQuiz
        });

    } catch (error) {
        console.error("Error al generar el Quiz del día:", error);
        res.status(500).json({ error: 'El destino se ha nublado momentáneamente.' });
    }
});

// Endpoint para salvar que el quiz de hoy ya fue respondido
app.post('/api/quiz-completar', async (req, res) => {
    try {
        const tzOffset = (new Date()).getTimezoneOffset() * 60000;
        const localISODate = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);
        const { categoria } = req.body;

        const data = await Progress.findOneAndUpdate(
            { userId: 'montse_0710' },
            { 
                $set: { 
                    "dailyQuiz.lastPlayed": localISODate,
                    "dailyQuiz.categoriaHoy": categoria
                },
                $inc: { "dailyQuiz.currentStreak": 1 } // Suma 1 a su racha de días jugando
            }, 
            { new: true, upsert: true }
        );
        res.json({ success: true, racha: data.dailyQuiz.currentStreak });
    } catch (error) {
        res.status(500).json({ error: 'Error al salvar respuesta del quiz' });
    }
});

// =========================================================
// INICIAR SERVIDOR
// =========================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`El Oráculo escucha en el puerto ${PORT}`));
