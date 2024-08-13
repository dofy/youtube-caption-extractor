import he from "he";
import { HttpsProxyAgent } from "https-proxy-agent";
import NodeFetch from "node-fetch";
import striptags from "striptags";

interface Subtitle {
  start: string;
  dur: string;
  text: string;
}

interface CaptionTrack {
  baseUrl: string;
  vssId: string;
}

export interface Options {
  videoID: string;
  lang?:
    | "en"
    | "zh"
    | "ja"
    | "ko"
    | "es"
    | "de"
    | "fr"
    | "it"
    | "ru"
    | (string & {});
  proxyURL?: string;
}

export interface VideoDetails {
  title: string;
  description: string;
  subtitles: Subtitle[];
}

const fetchThroughProxy = async (targetUrl: string, proxyUrl: string) => {
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  try {
    const response = await NodeFetch(targetUrl, { agent: proxyAgent });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${targetUrl} through proxy ${proxyUrl}`);
    }
    return response;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to fetch ${targetUrl} through proxy ${proxyUrl}`);
  } finally {
    proxyAgent.destroy();
  }
};

export const getVideoDetails = async ({
  videoID,
  lang = "en",
  proxyURL,
}: Options): Promise<VideoDetails> => {
  const youtubeUrl = `https://youtube.com/watch?v=${videoID}`;
  const response = proxyURL
    ? await fetchThroughProxy(youtubeUrl, proxyURL)
    : await fetch(youtubeUrl);
  const data = await response.text();

  // Extract title and description from the page data
  const titleMatch = data.match(
    /<meta name="title" content="([^"]*|[^"]*[^&]quot;[^"]*)">/
  );
  const descriptionMatch = data.match(
    /<meta name="description" content="([^"]*|[^"]*[^&]quot;[^"]*)">/
  );

  const title = titleMatch && titleMatch[1];
  const description =
    (descriptionMatch && descriptionMatch[1]) || "No description found";

  // if the titleMatch[1] is "", we should throw an error
  /**
   * - Title:
   * - Description: YouTube でお気に入りの動画や音楽を楽しみ、オリジナルのコンテンツをアップロードして友だちや家族、世界中の人たちと共有しましょう。
   */
  if (!title) {
    throw new Error(`No video found for: ${videoID}`);
  }

  // Check if the video page contains captions
  if (!data.includes("captionTracks")) {
    console.warn(`No captions found for video: ${videoID}`);
    return {
      title,
      description,
      subtitles: [],
    };
  }

  // Extract caption tracks JSON string from video page data
  const regex = /"captionTracks":(\[.*?\])/;
  const regexResult = regex.exec(data);

  if (!regexResult) {
    console.warn(`Failed to extract captionTracks from video: ${videoID}`);
    return {
      title,
      description,
      subtitles: [],
    };
  }

  const [_, captionTracksJson] = regexResult;
  const captionTracks = JSON.parse(captionTracksJson);

  // Find the appropriate subtitle language track
  const subtitle =
    captionTracks.find((track: CaptionTrack) => track.vssId === `.${lang}`) ||
    captionTracks.find((track: CaptionTrack) => track.vssId === `a.${lang}`) ||
    captionTracks.find(
      (track: CaptionTrack) => track.vssId && track.vssId.match(`.${lang}`)
    );

  // Check if the subtitle language track exists
  if (!subtitle?.baseUrl) {
    console.warn(`Could not find ${lang} captions for ${videoID}`);
    return {
      title,
      description,
      subtitles: [],
    };
  }

  // Fetch subtitles XML from the subtitle track URL
  const subtitlesResponse = await fetch(subtitle.baseUrl);
  const transcript = await subtitlesResponse.text();

  // Define regex patterns for extracting start and duration times
  const startRegex = /start="([\d.]+)"/;
  const durRegex = /dur="([\d.]+)"/;

  // Process the subtitles XML to create an array of subtitle objects
  const lines = transcript
    .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', "")
    .replace("</transcript>", "")
    .split("</text>")
    .filter((line: string) => line && line.trim())
    .reduce((acc: Subtitle[], line: string) => {
      // Extract start and duration times using regex patterns
      const startResult = startRegex.exec(line);
      const durResult = durRegex.exec(line);

      if (!startResult || !durResult) {
        console.warn(`Failed to extract start or duration from line: ${line}`);
        return acc;
      }

      const [, start] = startResult;
      const [, dur] = durResult;

      // Clean up subtitle text by removing HTML tags and decoding HTML entities
      const htmlText = line
        .replace(/<text.+>/, "")
        .replace(/&amp;/gi, "&")
        .replace(/<\/?[^>]+(>|$)/g, "");
      const decodedText = he.decode(htmlText);
      const text = striptags(decodedText);

      // Create a subtitle object with start, duration, and text properties
      acc.push({
        start,
        dur,
        text,
      });

      return acc;
    }, []);

  return {
    title,
    description,
    subtitles: lines,
  };
};

export const getSubtitles = async ({
  videoID,
  lang = "en",
  proxyURL,
}: Options): Promise<Subtitle[]> => {
  // Fetch YouTube video page data
  const youtubeUrl = `https://youtube.com/watch?v=${videoID}`;
  const response = proxyURL
    ? await fetchThroughProxy(youtubeUrl, proxyURL)
    : await fetch(youtubeUrl);
  const data = await response.text();

  // Check if the video page contains captions
  if (!data.includes("captionTracks")) {
    console.warn(`No captions found for video: ${videoID}`);
    return [];
  }

  // Extract caption tracks JSON string from video page data
  const regex = /"captionTracks":(\[.*?\])/;
  const regexResult = regex.exec(data);

  if (!regexResult) {
    console.warn(`Failed to extract captionTracks from video: ${videoID}`);
    return [];
  }

  const [_, captionTracksJson] = regexResult;
  const captionTracks = JSON.parse(captionTracksJson);

  // Find the appropriate subtitle language track
  const subtitle =
    captionTracks.find((track: CaptionTrack) => track.vssId === `.${lang}`) ||
    captionTracks.find((track: CaptionTrack) => track.vssId === `a.${lang}`) ||
    captionTracks.find(
      (track: CaptionTrack) => track.vssId && track.vssId.match(`.${lang}`)
    );

  // Check if the subtitle language track exists
  if (!subtitle?.baseUrl) {
    console.warn(`Could not find ${lang} captions for ${videoID}`);
    return [];
  }

  // Fetch subtitles XML from the subtitle track URL
  const subtitlesResponse = await fetch(subtitle.baseUrl);
  const transcript = await subtitlesResponse.text();

  // Define regex patterns for extracting start and duration times
  const startRegex = /start="([\d.]+)"/;
  const durRegex = /dur="([\d.]+)"/;

  // Process the subtitles XML to create an array of subtitle objects
  const lines = transcript
    .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', "")
    .replace("</transcript>", "")
    .split("</text>")
    .filter((line: string) => line && line.trim())
    .reduce((acc: Subtitle[], line: string) => {
      // Extract start and duration times using regex patterns
      const startResult = startRegex.exec(line);
      const durResult = durRegex.exec(line);

      if (!startResult || !durResult) {
        console.warn(`Failed to extract start or duration from line: ${line}`);
        return acc;
      }

      const [, start] = startResult;
      const [, dur] = durResult;

      // Clean up subtitle text by removing HTML tags and decoding HTML entities
      const htmlText = line
        .replace(/<text.+>/, "")
        .replace(/&amp;/gi, "&")
        .replace(/<\/?[^>]+(>|$)/g, "");
      const decodedText = he.decode(htmlText);
      const text = striptags(decodedText);

      // Create a subtitle object with start, duration, and text properties
      acc.push({
        start,
        dur,
        text,
      });

      return acc;
    }, []);

  return lines;
};
