const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/api/bienvenida', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite", // Cambiado a 2.5-flash para máxima velocidad
            generationConfig: {
                temperature: 0.85      /* Mantiene la frescura poética y rotación de apodos */
            }
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
        const responseText = result.response.text();

        res.json({ mensaje: responseText });

    } catch (error) {
        console.error("Error al generar mensaje:", error);
        res.status(500).json({ error: 'El oráculo no responde' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`El Oráculo está escuchando en el puerto ${PORT}`);
});
