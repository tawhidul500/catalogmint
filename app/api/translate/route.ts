export const runtime = "nodejs";
export const maxDuration = 30;

import { lookupName, TranslationError } from "@/lib/catalog/translation";
export async function POST(request:Request) {
  try {
    const {text,from,to}=await request.json() as {text:string;from:string;to:string};
    return Response.json({text:await lookupName(text,from,to)});
  } catch(error) {
    const typed=error instanceof TranslationError;
    return Response.json({error:typed?error.message:"Translation is unavailable right now. You can enter the name manually."},{status:typed?error.status:503});
  }
}
