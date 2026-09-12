/** Keep four-digit totals exact; abbreviate larger scores without changing them. */
export function formatPoints(points:number):string {
 const value=Math.max(0,Math.floor(points));
 if(value<10000)return String(value);
 const units=[{size:1e12,label:'t'},{size:1e9,label:'b'},{size:1e6,label:'m'},{size:1e3,label:'k'}];
 const unit=units.find(unit=>value>=unit.size)??units[3];
 const rounded=Math.round(value/unit.size*10)/10;
 const index=units.indexOf(unit);
 if(rounded>=1000&&index>0)return `1${units[index-1].label}`;
 return `${rounded}${unit.label}`;
}
