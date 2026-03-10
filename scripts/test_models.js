const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        // There is no direct listModels in the standard SDK easily accessible without an admin key sometimes, 
        // but we can try a test call.
        console.log("Testing gemini-1.5-pro...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent("Hi");
        console.log("Success with gemini-1.5-pro");
    } catch (e) {
        console.error("Failed with gemini-1.5-pro:", e.message);

        try {
            console.log("Testing gemini-1.5-pro-latest...");
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
            const result = await model.generateContent("Hi");
            console.log("Success with gemini-1.5-pro-latest");
        } catch (e2) {
            console.error("Failed with gemini-1.5-pro-latest:", e2.message);
        }
    }
}

listModels();
