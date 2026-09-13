import {useState} from 'react';
import artwork from '../lib/country-artwork.json';

export const landmarkNames:Record<string,string>=artwork;
export function CountryLandmark({country}:{country:string}){
 const [failed,setFailed]=useState('');
 const title=landmarkNames[country];
 if(!title)return null;
 if(failed===country)return <span aria-label={title} className={`fi fi-${country.toLowerCase()} donation-large-flag`}/>;
 // Static SVGs are already small; this Vite app has no Next image optimizer.
 // eslint-disable-next-line next/no-img-element
 return <img className="country-landmark" src={`/landmarks/${country}.svg`} width={320} height={230} alt={title} onError={()=>setFailed(country)}/>;
}
