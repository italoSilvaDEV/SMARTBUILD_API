import OpenAI from "openai";
import { KnowledgeBase } from "./knowledge/KnowledgeBase";

export const openai = process.env.OPENAI_KEY ? new OpenAI({ apiKey: process.env.OPENAI_KEY }) : null;

export const knowledgeBase = openai ? new KnowledgeBase(openai) : null;
