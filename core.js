
const SUPABASE_URL='https://zezwzynowqderzolzejh.supabase.co';
const SUPABASE_KEY='sb_publishable_-cNsdAapkRAcpqcQiWEzcw_B16Xxepf';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const PROFESSIONALS=[
 {name:'Pedro Neira',email:'pedropneira@gmail.com',color:'#0aaea7'},
 {name:'Carolina Marín',email:'carolmarin3.cm@gmail.com',color:'#7b61a8'},
 {name:'Juan Luis Barroso',email:'info@juanluisbarroso.com',color:'#d07a2d'},
 {name:'Maite Sandobal',email:'masan01@ucm.es',color:'#4879bd'},
 {name:'Ada',email:'ademusat@gmail.com',color:'#b45d82'}
];
const FREQS=['Semanal','Quincenal','3 semanas','Mensual','Seguimiento'];
const storeKey='psycast-v2';
const emptyData=()=>({blocks:{},bookings:{},patients:Object.fromEntries(PROFESSIONALS.map(p=>[p.name,[]])),donationRate:0});
let data=JSON.parse(localStorage.getItem(storeKey)||'null')||emptyData();
PROFESSIONALS.forEach(p=>{if(!data.patients[p.name])data.patients[p.name]=[]});
let weekOffset=0,reportOffset=0,selectedPro=PROFESSIONALS[0].name,currentSlot=null;
let remoteReady=false,lastSynced=emptyData(),syncing=false,reloadTimer=null;

const $=id=>document.getElementById(id); const pad=n=>String(n).padStart(2,'0');
const clone=o=>JSON.parse(JSON.stringify(o));
function dateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseDate(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function monday(base=new Date(),offset=0){let d=new Date(base);d.setHours(12,0,0,0);let day=d.getDay()||7;d.setDate(d.getDate()-day+1+offset*7);return d}
function weekRange(offset){const m=monday(new Date(),offset),f=new Date(m);f.setDate(m.getDate()+4);return [m,f]}
function fmtDate(d){return d.toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'2-digit'})}
function fmtLong(d){return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})}
function proByName(n){return PROFESSIONALS.find(p=>p.name===n)}
function proByEmail(e){return PROFESSIONALS.find(p=>p.email===e)}
function blockKey(date,shift){return `${date}|${shift}`}
function bookingKey(date,hour){return `${date}|${hour}`}
function shiftForHour(h){return h<15?'am':'pm'}
function statusText(s){return s==='seen'?'Visto':s==='absence'?'Ausencia':s==='cancelled'?'Cancelación':'Ocupado'}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function ensurePatientIds(){
  for(const p of PROFESSIONALS){
    for(const x of data.patients[p.name]||[]){
      if(!x.id)x.id=crypto.randomUUID();
    }
  }
}
function persistLocal(){ensurePatientIds();localStorage.setItem(storeKey,JSON.stringify(data))}
function save(){
  persistLocal();
  renderAll();
  if(remoteReady){
    window.__psycastSync=(window.__psycastSync||Promise.resolve()).then(syncToSupabase).catch(e=>showSyncError(e));
  }
}
function showSyncError(e){
  console.error(e);
  const n=document.querySelector('.notice');
  if(n)n.insertAdjacentHTML('afterend','<div class="notice" style="background:#fff4e5;border-color:#ffd59a"><b>Aviso:</b> no se pudo sincronizar un cambio. Revisa tu conexión e inténtalo de nuevo.</div>');
}
function meaningfulLocal(d){
  return Object.keys(d.blocks||{}).length||Object.keys(d.bookings||{}).length||
    Object.values(d.patients||{}).some(a=>a?.length)||Number(d.donationRate||0)!==0;
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}

async function syncToSupabase(){
  if(!remoteReady||syncing)return;
  syncing=true;
  try{
    ensurePatientIds();
    const prev=lastSynced||emptyData();

    const currentBlockKeys=new Set(Object.keys(data.blocks||{}));
    for(const k of Object.keys(prev.blocks||{})){
      if(!currentBlockKeys.has(k)){
        const [block_date,shift]=k.split('|');
        const {error}=await sb.from('blocks').delete().eq('block_date',block_date).eq('shift',shift); if(error)throw error;
      }
    }
    for(const [k,b] of Object.entries(data.blocks||{})){
      if(same(b,prev.blocks?.[k]))continue;
      const [block_date,shift]=k.split('|');
      const row={block_date,shift,block_type:b.type,professional_email:b.type==='professional'?(proByName(b.professional)?.email||null):null,external_name:b.externalName||null,updated_at:new Date().toISOString()};
      const {error}=await sb.from('blocks').upsert(row,{onConflict:'block_date,shift'}); if(error)throw error;
    }

    const currentBookingKeys=new Set(Object.keys(data.bookings||{}));
    for(const k of Object.keys(prev.bookings||{})){
      if(!currentBookingKeys.has(k)){
        const [appointment_date,h]=k.split('|');
        const {error}=await sb.from('appointments').delete().eq('appointment_date',appointment_date).eq('appointment_hour',Number(h)); if(error)throw error;
      }
    }
    for(const [k,a] of Object.entries(data.bookings||{})){
      if(same(a,prev.bookings?.[k]))continue;
      const [appointment_date,h]=k.split('|');
      const row={appointment_date,appointment_hour:Number(h),professional_email:a.professional==='Otro'?null:(proByName(a.professional)?.email||null),external_name:a.professional==='Otro'?(a.otherName||null):null,patient_initials:a.initials||null,status:a.status||'occupied',updated_at:new Date().toISOString()};
      const {error}=await sb.from('appointments').upsert(row,{onConflict:'appointment_date,appointment_hour'}); if(error)throw error;
    }

    const flatten=d=>{
      const m={};
      for(const p of PROFESSIONALS)for(const x of d.patients?.[p.name]||[])if(x.id)m[x.id]={...x,professional:p.name};
      return m;
    };
    const curP=flatten(data),prevP=flatten(prev);
    for(const id of Object.keys(prevP)){
      if(!curP[id]){const {error}=await sb.from('patients').delete().eq('id',id); if(error)throw error;}
    }
    for(const [id,x] of Object.entries(curP)){
      if(same(x,prevP[id]))continue;
      const row={id,professional_email:proByName(x.professional)?.email,initials:x.initials,frequency:x.frequency};
      const {error}=await sb.from('patients').upsert(row,{onConflict:'id'}); if(error)throw error;
    }

    if(Number(data.donationRate||0)!==Number(prev.donationRate||0)){
      const {error}=await sb.from('settings').upsert({key:'donation_rate',value:Number(data.donationRate||0),updated_at:new Date().toISOString()},{onConflict:'key'}); if(error)throw error;
    }

    lastSynced=clone(data);
  }finally{syncing=false}
}

async function loadSharedData(allowMigration=true){
  const localSnapshot=clone(data);
  const [bq,aq,pq,sq]=await Promise.all([
    sb.from('blocks').select('*'),
    sb.from('appointments').select('*'),
    sb.from('patients').select('*'),
    sb.from('settings').select('*').eq('key','donation_rate').maybeSingle()
  ]);
  for(const q of [bq,aq,pq,sq])if(q.error)throw q.error;
  const hasRemote=(bq.data?.length||0)+(aq.data?.length||0)+(pq.data?.length||0)>0;
  if(allowMigration&&!hasRemote&&meaningfulLocal(localSnapshot)){
    data=localSnapshot; ensurePatientIds(); lastSynced=emptyData(); remoteReady=true;
    await syncToSupabase();
    persistLocal(); renderAll(); return;
  }
  const fresh=emptyData();
  for(const r of bq.data||[]){
    fresh.blocks[blockKey(r.block_date,r.shift)]=r.block_type==='rented'?{type:'rented'}:{type:'professional',professional:proByEmail(r.professional_email)?.name||'Disponible'};
  }
  for(const r of aq.data||[]){
    const internal=proByEmail(r.professional_email);
    fresh.bookings[bookingKey(r.appointment_date,r.appointment_hour)]={professional:internal?.name||'Otro',otherName:internal?'':(r.external_name||''),initials:r.patient_initials||'',status:r.status||'occupied'};
  }
  for(const r of pq.data||[]){
    const p=proByEmail(r.professional_email); if(p)fresh.patients[p.name].push({id:r.id,initials:r.initials,frequency:r.frequency});
  }
  fresh.donationRate=Number(sq.data?.value??0);
  data=fresh; lastSynced=clone(fresh); remoteReady=true; persistLocal(); renderAll();
}

function queueRemoteReload(){
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(async()=>{if(syncing){queueRemoteReload();return}try{await loadSharedData(false)}catch(e){console.error(e)}},500);
}
function startRealtime(){
  sb.channel('psycast-shared')
    .on('postgres_changes',{event:'*',schema:'public',table:'blocks'},queueRemoteReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'appointments'},queueRemoteReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'patients'},queueRemoteReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'settings'},queueRemoteReload)
    .subscribe();
}

function setAuthMessage(msg,bad=false){
  const el=$('authMessage'); if(!el)return; el.textContent=msg; el.className='auth-message'+(bad?' bad':'');
}
async function requestMagicLink(){
  const email=$('loginEmail').value.trim().toLowerCase();
  if(!PROFESSIONALS.some(p=>p.email.toLowerCase()===email)){setAuthMessage('Este correo no está autorizado para acceder a Psycast.',true);return}
  $('loginBtn').disabled=true; setAuthMessage('Enviando enlace...');
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin,shouldCreateUser:true}});
  $('loginBtn').disabled=false;
  if(error){setAuthMessage('No se ha podido enviar el enlace. Inténtalo de nuevo.',true);return}
  setAuthMessage('Te hemos enviado un enlace de acceso al correo. Ábrelo para entrar.');
}
async function enterApp(user){
  const email=(user.email||'').toLowerCase();
  const {data:allowed,error}=await sb.from('allowed_users').select('email,display_name').eq('email',email).maybeSingle();
  if(error||!allowed){
    await sb.auth.signOut();
    $('appShell').hidden=true;$('authScreen').style.display='grid';
    setAuthMessage('Este correo no está autorizado para acceder a Psycast.',true);return;
  }
  $('currentUser').textContent=allowed.display_name||email;
  $('authScreen').style.display='none';$('appShell').hidden=false;
  try{await loadSharedData(true);startRealtime()}catch(e){console.error(e);alert('No se han podido cargar los datos compartidos.')}
}
async function initAuth(){
  $('loginBtn').onclick=requestMagicLink;
  $('loginEmail').addEventListener('keydown',e=>{if(e.key==='Enter')requestMagicLink()});
  $('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
  const {data:{session}}=await sb.auth.getSession();
  if(session)await enterApp(session.user);
  else{$('authScreen').style.display='grid';$('appShell').hidden=true}
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_IN'&&session)await enterApp(session.user);
  });
}
window.addEventListener('DOMContentLoaded',initAuth);
