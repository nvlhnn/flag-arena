import {loadEnvFile} from 'node:process';
import {existsSync} from 'node:fs';
if(process.env.ARENA_IGNORE_ENV!=='1'&&existsSync('.env'))loadEnvFile('.env');
export function configuredKeys(){
 try{const value=JSON.parse(process.env.YOUTUBE_API_KEYS||'[]');if(!Array.isArray(value)||value.some(key=>typeof key!=='string'||!key.trim()))throw new Error();return [...new Set<string>(value.map(key=>key.trim()))];}
 catch{throw new Error('YOUTUBE_API_KEYS must be a JSON array of API key strings in .env.');}
}
