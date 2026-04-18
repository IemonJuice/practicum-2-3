import { NextRequest } from "next/server";
import { getUserMeLoader } from "@/data/services/get-user-me-loader";
import { getAuthToken } from "@/data/services/get-token";
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { YoutubeTranscript } from "youtube-transcript";

const TEMPLATE = `
INSTRUCTIONS: 
  For the this {text} complete the following steps.
  Generate the title for based on the content provided
  Summarize the following content and include 5 key topics, writing in first person using normal tone of voice.
  
  Write a youtube video description
    - Include heading and sections.  
    - Incorporate keywords and key takeaways

  Generate bulleted list of key points and benefits

  Return possible and best recommended key words
`;

async function generateSummary(content: string, template: string): Promise<string> {
  const prompt = PromptTemplate.fromTemplate(template);
  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
  });

  const outputParser = new StringOutputParser();
  const chain = prompt.pipe(model).pipe(outputParser);

  return await chain.invoke({ text: content });
}

export async function POST(req: NextRequest) {
  const user = await getUserMeLoader();
  const token = await getAuthToken();

  if (!user.ok || !token) {
    return new Response(
        JSON.stringify({ data: null, error: "Not authenticated" }),
        { status: 401 }
    );
  }

  if (user.data.credits < 1) {
    return new Response(
        JSON.stringify({ data: null, error: "Insufficient credits" }),
        { status: 402 }
    );
  }

  const body = await req.json();
  const videoId = body.videoId;

  if (!videoId) {
    return new Response(
        JSON.stringify({ data: null, error: "videoId is required" }),
        { status: 400 }
    );
  }

  let transcriptData: string;
  try {
    const transcriptArr = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcriptArr || transcriptArr.length === 0) {
      return new Response(
          JSON.stringify({ data: null, error: "Транскрипт порожній або недоступний для цього відео" }),
          { status: 404 }
      );
    }
    transcriptData = transcriptArr.map((t) => t.text).join(" ");
    console.log("TRANSCRIPT:", transcriptData.slice(0, 500));
  } catch (error) {
    console.error("Transcript error:", error);
    return new Response(
        JSON.stringify({ data: null, error: "Не вдалося отримати транскрипт. Перевір чи відео має субтитри." }),
        { status: 404 }
    );
  }

  try {
    const summary = await generateSummary(transcriptData, TEMPLATE);
    return new Response(JSON.stringify({ data: summary, error: null }));
  } catch (error) {
    console.error("Summary error:", error);
    return new Response(
        JSON.stringify({ data: null, error: "Помилка генерації саммері" }),
        { status: 500 }
    );
  }
}
