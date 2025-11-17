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

// index.js (เพิ่มส่วนนี้ก่อนฟังก์ชัน handleEvent)

// --- Utility Functions for LINE Rich UI ---

// ฟังก์ชันสำหรับสร้าง Quick Reply Items สำหรับการนำทางหลัก
function getQuickReplyItems() {
    return {
        items: [
            // ใช้ type: 'message' เพื่อให้ผู้ใช้พิมพ์ข้อความเข้า Flow โดยอัตโนมัติ
            { type: 'action', action: { type: 'message', label: '📞 แจ้งเคลมด่วน', text: 'แจ้งเคลม' } },
            { type: 'action', action: { type: 'message', label: '✅ ดูแพ็กเกจ', text: 'ดูแพ็กเกจ' } },
            { type: 'action', action: { type: 'message', label: '📍 หาศูนย์ซ่อม', text: 'ศูนย์ซ่อม' } },
        ],
    };
}

// ฟังก์ชันสำหรับสร้าง Flex Message (ตัวอย่าง รายละเอียดแพ็กเกจประกัน)
function getPackageFlexMessage() {
    return {
        type: 'flex',
        altText: 'รายละเอียดแพ็กเกจประกันยอดนิยม',
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '✨ แพ็กเกจประกันชั้น 1 (A+)', weight: 'bold', color: '#00B900', size: 'sm' },
                    { type: 'text', text: 'คุ้มครองครบวงจร', weight: 'bold', size: 'xl', margin: 'md' },
                    {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        spacing: 'sm',
                        contents: [
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                                { type: 'text', text: '✅', color: '#1DB446', size: 'sm', flex: 1 },
                                { type: 'text', text: 'ซ่อมศูนย์ในเครือทั้งหมด', color: '#666666', size: 'sm', flex: 5 }
                            ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                                { type: 'text', text: '✅', color: '#1DB446', size: 'sm', flex: 1 },
                                { type: 'text', text: 'ชดเชยค่าเดินทางระหว่างซ่อม', color: '#666666', size: 'sm', flex: 5 }
                            ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                                { type: 'text', text: '✅', color: '#1DB446', size: 'sm', flex: 1 },
                                { type: 'text', text: 'ไม่มีค่า Excess (กรณีที่ถูกต้อง)', color: '#666666', size: 'sm', flex: 5 }
                            ] }
                        ]
                    },
                    { type: 'separator', margin: 'xxl' },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'md',
                        contents: [
                            { type: 'text', text: 'ราคาเริ่มต้น:', size: 'sm', color: '#AAAAAA', flex: 2 },
                            { type: 'text', text: '14,999 บาท/ปี', size: 'sm', color: '#000000', align: 'end', flex: 3, weight: 'bold' }
                        ]
                    }
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    { type: 'button', style: 'primary', height: 'sm', action: { type: 'message', label: 'ขอใบเสนอราคา', text: 'ต้องการใบเสนอราคาสำหรับประกันชั้น 1' } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'โทรหาเจ้าหน้าที่ (24 ชม.)', uri: 'tel:021234567' } }
                ]
            }
        }
    };
}

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userMessage = event.message.text.trim();
    let replyMessages = [];

    console.log(`Received message from user: ${userMessage}`);

    // --- A. การจัดการคำสำคัญ (Keyword Matching) ---

    // 1. ตรวจสอบ 'ดูแพ็กเกจ' (Flex Message)
    if (userMessage.includes('แพ็กเกจ') || userMessage.includes('ราคา') || userMessage.includes('ประกัน')) {
        const welcomeMessage = { type: 'text', text: 'นี่คือแพ็กเกจประกันยอดนิยมของเราค่ะ/ครับ:' };
        const flexMessage = getPackageFlexMessage();
        
        replyMessages.push(welcomeMessage, flexMessage);
        
        // เพิ่ม Quick Reply เพื่อนำทางต่อ
        replyMessages.push({ 
            type: 'text', 
            text: 'สนใจข้อมูลอื่นๆ เพิ่มเติมไหมคะ/ครับ?', 
            quickReply: getQuickReplyItems() 
        });

    } 
    // 2. ตรวจสอบ 'แจ้งเคลม' (แก้ปัญหา Looping: ให้ตัวเลือกแทนการเริ่ม Flow ทันที)
    else if (userMessage.includes('เคลม') || userMessage.includes('รถชน') || userMessage.includes('แจ้งเหตุ')) {
         replyMessages.push({
            type: 'text',
            // **ข้อความแก้ไข:** สอบถามความต้องการชัดเจนว่า "จะเริ่มเคลม" หรือ "แค่ถามคำถาม"
            text: 'รับทราบค่ะ ต้องการ *เริ่ม* แจ้งเคลมเลยใช่ไหมคะ? หรือมีคำถามเกี่ยวกับขั้นตอนคะ?',
            quickReply: {
                 items: [
                    // ปุ่มที่พาผู้ใช้เข้าสู่ Claim Flow ที่แท้จริง
                    { type: 'action', action: { type: 'message', label: '🚗 เริ่มแจ้งเคลมตอนนี้', text: 'เริ่มเคลม' } }, 
                    { type: 'action', action: { type: 'message', label: '❌ ยกเลิก/คุยกับคน', text: 'คุยกับเจ้าหน้าที่' } },
                ]
            }
        });
    }
    // 3. ตรวจสอบ 'สวัสดี' (Quick Reply)
    else if (userMessage.toLowerCase().includes('สวัสดี') || userMessage.toLowerCase().includes('hi') || userMessage.toLowerCase() === 'หวัดดี') {
        replyMessages.push({
            type: 'text',
            text: 'สวัสดีค่ะ/ครับ ยินดีให้บริการค่ะ/ครับ คุณต้องการให้ดิฉันช่วยเรื่องใดคะ?',
            quickReply: getQuickReplyItems()
        });
    }
    // --- B. ส่งไปให้ Gemini AI (Fallback) ---
    else {
        // **การแก้ไข:** กำหนด System Instruction เพื่อจำกัดขอบเขตความรู้
        const systemInstruction = `
            คุณคือผู้ช่วย Chatbot สำหรับบริษัทประกันภัยชั้นนำเท่านั้น หน้าที่ของคุณคือตอบคำถามเกี่ยวกับผลิตภัณฑ์ประกันภัย, การเคลม, และบริการหลังการขาย
            
            คำสั่งสำคัญ:
            1. ห้ามตอบคำถามที่ไม่เกี่ยวข้องกับประกันภัย, การเงิน, หรือบริการของบริษัทประกัน (เช่น ชีวะ, เคมี, ประวัติศาสตร์, สูตรอาหาร, การเมือง, ข่าวทั่วไป).
            2. หากได้รับคำถามที่ไม่เกี่ยวข้อง ให้ตอบอย่างสุภาพว่า "ขออภัยค่ะ/ครับ ดิฉันเป็น Chatbot ผู้เชี่ยวชาญด้านประกันภัยเท่านั้น ไม่สามารถตอบคำถามในหัวข้อนี้ได้ค่ะ/ครับ"
            3. ตอบกลับด้วยภาษาไทยเท่านั้น
        `;
        try {
            const response = await geminiAI.models.generateContent({
                model: GEMINI_MODEL,
                config: {
                    systemInstruction: systemInstruction, // ใช้ System Instruction ที่จำกัดขอบเขต
                },
                contents: [{ role: "user", parts: [{ text: userMessage }] }],
            });

            const geminiResponseText = response.text;
            console.log(`Gemini response: ${geminiResponseText}`);

            // ตอบกลับด้วยข้อความจาก Gemini และแนบ Quick Reply
            replyMessages.push({
                type: 'text',
                text: geminiResponseText,
                quickReply: getQuickReplyItems()
            });

        } catch (error) {
            console.error('Error calling Gemini API:', error);
            // Fallback Error Message
            replyMessages.push({
                type: 'text',
                text: 'ขออภัยค่ะ เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ AI กรุณาลองใหม่อีกครั้งค่ะ',
            });
        }
    }

    // 4. ตอบกลับไปยัง LINE
    if (replyMessages.length > 0) {
        try {
            return lineClient.replyMessage(event.replyToken, replyMessages);
        } catch (lineError) {
            // ตรวจสอบ Error จาก LINE API (401/403)
            if (lineError.statusCode === 401 || lineError.statusCode === 403) {
                console.error('❌ LINE API TOKEN ERROR: Channel Access Token อาจหมดอายุหรือไม่ถูกต้อง');
                console.error('   LINE API Message:', lineError.message);
                return Promise.resolve(null); 
            }
            console.error('❌ Error replying to LINE:', lineError);
            return Promise.resolve(null);
        }
    }
    
    return Promise.resolve(null);
}

// --- Server Start Up ---

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running and listening on port ${PORT}`);
    console.log(`Set your LINE webhook URL to: http://<your-host-url>:${PORT}/webhook`);
});
