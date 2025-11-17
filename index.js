// index.js

require('dotenv').config();

const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const { GoogleGenAI } = require('@google/genai'); 

// --- 1. ตั้งค่า LINE Client ---
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(config);

// --- 2. ตั้งค่า Gemini AI Client ---
const geminiAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = 'gemini-2.5-flash'; 

// System Instruction สำหรับจำกัดขอบเขตความรู้ (Scope Limitation)
const SYSTEM_INSTRUCTION = `
    คุณคือผู้ช่วย Chatbot สำหรับบริษัทประกันภัยเท่านั้น หน้าที่ของคุณคือตอบคำถามเกี่ยวกับผลิตภัณฑ์ประกันภัย, การเคลม, และบริการหลังการขาย
    
    คำสั่งสำคัญ:
    1. ห้ามตอบคำถามที่ไม่เกี่ยวข้องกับประกันภัย, การเงิน, หรือบริการของบริษัทประกัน (เช่น ชีวะ, เคมี, ประวัติศาสตร์, สูตรอาหาร, การเมือง, ข่าวทั่วไป).
    2. หากได้รับคำถามที่ไม่เกี่ยวข้อง ให้ตอบอย่างสุภาพว่า "ขออภัยค่ะ/ครับ ดิฉันเป็น Chatbot ผู้เชี่ยวชาญด้านประกันภัยเท่านั้น ไม่สามารถตอบคำถามในหัวข้อนี้ได้ค่ะ/ครับ".
    3. ตอบกลับด้วยภาษาไทยเท่านั้น.
`;

// --- Utility Functions for LINE Rich UI ---

// ฟังก์ชันสำหรับสร้าง Quick Reply Items สำหรับการนำทางหลัก
function getQuickReplyItems() {
    return {
        items: [
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

// --- ฟังก์ชัน 3: เรียก Gemini AI พร้อมจำกัดขอบเขต ---
async function getGeminiResponse(userMessage) {
    try {
        const response = await geminiAI.models.generateContent({
            model: GEMINI_MODEL,
            // 1. ใส่ System Instruction เพื่อจำกัดขอบเขตความรู้
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
            },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
        });

        const geminiResponseText = response.text;
        console.log(`[GEMINI] Response: ${geminiResponseText.substring(0, 100)}...`);
        return geminiResponseText;

    } catch (error) {
        console.error('❌ Error calling Gemini AI:', error);
        return 'ขออภัยค่ะ เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ AI กรุณาลองใหม่อีกครั้งค่ะ';
    }
}

// --- 4. Webhook Handler (รวม Logic Flow และ Keyword Matching) ---
async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }
    
    const userId = event.source.userId;
    const userMessage = event.message.text.trim();
    let replyMessages = [];

    console.log(`[USER: ${userId}] Received message: ${userMessage}`);

    // --- A. การจัดการคำสำคัญ (Keyword Matching & Flow) ---

    // 1. ตรวจสอบ 'ดูแพ็กเกจ/ราคา' (ตอบกลับด้วย Flex Message)
    if (userMessage.includes('แพ็กเกจ') || userMessage.includes('ราคา') || userMessage.includes('ประกัน')) {
        const welcomeMessage = { type: 'text', text: 'นี่คือแพ็กเกจประกันยอดนิยมของเราค่ะ/ครับ:' };
        const flexMessage = getPackageFlexMessage();
        
        replyMessages.push(welcomeMessage, flexMessage);
        replyMessages.push({ type: 'text', text: 'สนใจข้อมูลอื่นๆ เพิ่มเติมไหมคะ/ครับ?', quickReply: getQuickReplyItems() });
    } 
    // 2. ตรวจสอบ 'แจ้งเคลม' (เริ่ม Claim Flow ด้วย Quick Reply)
    else if (userMessage.includes('เคลม') || userMessage.includes('รถชน') || userMessage.includes('แจ้งเหตุ')) {
         replyMessages.push({
            type: 'text',
            text: 'รับทราบค่ะ ต้องการ *เริ่ม* แจ้งเคลมเลยใช่ไหมคะ? หรือมีคำถามเกี่ยวกับขั้นตอนคะ? (ถ้าต้องการถาม ให้พิมพ์ข้อความคำถามมาเลย)',
            quickReply: {
                 items: [
                    { type: 'action', action: { type: 'message', label: '🚗 เริ่มแจ้งเคลมตอนนี้', text: 'เริ่มเคลม' } }, 
                    { type: 'action', action: { type: 'message', label: '❌ ยกเลิก/คุยกับคน', text: 'คุยกับเจ้าหน้าที่' } },
                ]
            }
        });
    }
    // 3. ตรวจสอบ 'สวัสดี'
    else if (userMessage.toLowerCase().includes('สวัสดี') || userMessage.toLowerCase().includes('hi') || userMessage.toLowerCase() === 'หวัดดี') {
        replyMessages.push({
            type: 'text',
            text: 'สวัสดีค่ะ/ครับ ยินดีให้บริการค่ะ/ครับ คุณต้องการให้ดิฉันช่วยเรื่องใดคะ?',
            quickReply: getQuickReplyItems()
        });
    }
    // --- B. ส่งไปให้ Gemini AI (Fallback) ---
    else {
        // หากไม่เข้าเงื่อนไข Flow ใดๆ ให้ส่งไปให้ Gemini ตอบ (โดยมี System Instruction คุมขอบเขต)
        const geminiResponseText = await getGeminiResponse(userMessage);
        
        replyMessages.push({
            type: 'text',
            text: geminiResponseText,
            quickReply: getQuickReplyItems()
        });
    }

    // 4. ตอบกลับไปยัง LINE และตรวจสอบ Error
    if (replyMessages.length > 0) {
        try {
            return lineClient.replyMessage(event.replyToken, replyMessages);
        } catch (lineError) {
            // **Log สำหรับตรวจสอบ Token Error**
            if (lineError.statusCode === 401 || lineError.statusCode === 403) {
                console.error('❌ LINE API TOKEN ERROR: Channel Access Token อาจหมดอายุหรือไม่ถูกต้อง');
                console.error('   LINE API Message:', lineError.message);
                return Promise.resolve(null); 
            }
            console.error('❌ Error replying to LINE:', lineError);
            return Promise.resolve(null);
        }
    }
    
    return Promise.resolve(null);
}


// --- 5. ตั้งค่า Express Server ---
const app = express();
const PORT = process.env.PORT || 3000;

app.post('/webhook', middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/webhook`);
});