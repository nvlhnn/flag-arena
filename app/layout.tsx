import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Flag Arena — Live country competition',description:'A vertical country leaderboard powered by YouTube chat votes.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
