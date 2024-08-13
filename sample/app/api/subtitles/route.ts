import { NextResponse, type NextRequest } from "next/server";
import { getSubtitles, getVideoDetails } from "youtube-caption-extractor";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const videoID = searchParams.get("videoID");
  const lang = searchParams.get("lang") || "en";
  const proxyURL = searchParams.get("proxyURL") ?? undefined;

  if (!videoID) {
    return NextResponse.json({ error: "Missing videoID" }, { status: 400 });
  }

  try {
    const subtitles = await getSubtitles({ videoID, lang, proxyURL });
    console.log("🚀 ~ GET ~ subtitles:", subtitles)
    const videoDetails = await getVideoDetails({ videoID, lang, proxyURL });
    console.log("🚀 ~ GET ~ videoDetails:", videoDetails)
    return NextResponse.json({ subtitles, videoDetails }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
