// index.js

require('dotenv').config(); // Load variables from .env file

const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const { GoogleGenAI } = require('@google/genai');

// --- Configuration and Initialization ---

// LINE Messaging API Configuration
const lineConfig = {
    // These keys are loaded from the .env file using process.env
    channelAccessToken: process.env.LINE_TOKEN,
    channelSecret: process.env.LINE_CHANEL_SECRET,
};

// Initialize LINE Client
const lineClient = new Client(lineConfig);

// Initialize Gemini AI Client
const geminiAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = 'gemini-2.5-flash'; // A fast and capable model for chat

// Initialize Express App
const app = express();

// --- Main Webhook Handler ---

// LINE Middleware is used to validate the request signature
// It also places the parsed body into req.body
app.use(middleware(lineConfig));

// Webhook endpoint: This is the URL LINE will POST to (e.g., https://yourdomain.com/webhook)
app.post('/webhook', (req, res) => {
    // req.body.events is an array of events (messages, follow events, etc.)
    const events = req.body.events;

    // Process all events concurrently and send the response back
    Promise.all(events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error('Webhook processing error:', err);
            res.status(500).end();
        });
});

// --- Event Handling Logic ---

async function handleEvent(event) {
    // Only handle 'message' events that are 'text'
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userMessage = event.message.text;

    console.log(`Received message from user: ${userMessage}`);

    try {
        // 1. Call the Gemini API
        const response = await geminiAI.models.generateContent({
            model: GEMINI_MODEL,
            // Send the user's message as a simple chat prompt
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
        });

        const geminiResponseText = response.text;
        
        console.log(`Gemini response: ${geminiResponseText}`);

        // 2. Create a reply message object for LINE
        const replyTextObject = {
            type: 'text',
            text: geminiResponseText,
        };

        // 3. Reply to the user via LINE
        // event.replyToken is a token used to send a response message back to the user
        return lineClient.replyMessage(event.replyToken, replyTextObject);

    } catch (error) {
        console.error('Error calling Gemini API or replying to LINE:', error);

        // Send a fallback error message to the user
        const errorReply = {
            type: 'text',
            text: 'I apologize, I encountered an internal error. Please try asking me again.',
        };
        return lineClient.replyMessage(event.replyToken, errorReply);
    }
}

// --- Server Start Up ---

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running and listening on port ${PORT}`);
    console.log(`Set your LINE webhook URL to: http://<your-host-url>:${PORT}/webhook`);
});
