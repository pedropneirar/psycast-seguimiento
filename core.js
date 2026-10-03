
const PROFESSIONALS=[
 {name:'Pedro Neira',email:'pedropneira@gmail.com',color:'#0aaea7'},
 {name:'Carolina Marín',email:'carolmarin3.cm@gmail.com',color:'#7b61a8'},
 {name:'Juan Luis Barroso',email:'info@juanluisbarroso.com',color:'#d07a2d'},
 {name:'Maite Sandobal',email:'masan01@ucm.es',color:'#4879bd'},
 {name:'Ada',email:'ademusat@gmail.com',color:'#b45d82'}
];
const FREQS=['Semanal','Quincenal','3 semanas','Mensual','Seguimiento'];
const storeKey='psycast-v2';
let data=JSON.parse(localStorage.getItem(storeKey)||'null')||{blocks:{},bookings:{},patients:{},donationRate:0};
PROFESSIONALS.forEach(p=>{if(!data.patients[p.name])data.patients[p.name]=[]});
let weekOffset=0,reportOffset=0,selectedPro=PROFESSIONALS[0].name,currentSlot=null;
const $=id=>document.getElementById(id); const pad=n=>String(n).padStart(2,'0');
function save(){localStorage.setItem(storeKey,JSON.stringify(data));renderAll()}
function dateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function monday(base=new Date(),offset=0){let d=new Date(base);d.setHours(12,0,0,0);let day=d.getDay()||7;d.setDate(d.getDate()-day+1+offset*7);return d}
function weekRange(offset){const m=monday(new Date(),offset),f=new Date(m);f.setDate(m.getDate()+4);return [m,f]}
function fmtDate(d){return d.toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'2-digit'})}
function fmtLong(d){return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
function proByName(n){return PROFESSIONALS.find(p=>p.name===n)}
function blockKey(date,shift){return `${date}|${shift}`}
function bookingKey(date,hour){return `${date}|${hour}`}
function shiftForHour(h){return h<15?'am':'pm'}
function statusText(s){return s==='seen'?'Visto':s==='absence'?'Ausencia':s==='cancelled'?'Cancelación':'Ocupado'}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
