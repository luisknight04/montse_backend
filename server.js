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
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        
        const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
        const daysLeft = Math.ceil((new Date("2026-10-28    ") - new Date()) / (1000 * 60 * 60 * 24));

        const prompt = `Hoy es ${today}. Faltan ${daysLeft} días para nuestro aniversario. Actúa como un narrador melancólico y romántico de una novela romántica 
        del estilo Orgullo y Prejuicio, Pídeme lo que quieras, Cumbres borrascosas, 50 sombras de grey, El amor en los tiempos del 
        cólera, Poesía completa de Pizarnik, etc. 
        Eres un confidente secreto. Genera un mensaje breve (máximo 25 palabras) para mi novia Montse al entrar al sitio web, no uses su nombre para referirte a ella,
        en su lugar usa alguno de los siguientes apodos: Mi amor, Mi vida, Mi reina, Flaca, Princesa, Corazón, etc. Utiliza un apodo diferente cada vez.
        Tono intelectual, poético y misterioso 
        con toques coquetos priorizando lo romántico. 
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
