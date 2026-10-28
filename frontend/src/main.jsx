import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShieldCheck, LogIn, Trash2, Plus, CalendarDays } from 'lucide-react';
import './styles.css';

import { OFFLINE, getNrcReference, searchCrimes, adminLogin, registerUser, userLogin, listCrimes, createCrime, deleteCrime } from './api.js';

if (OFFLINE) Promise.all([
  import('@fontsource/noto-sans-myanmar/400.css'),
  import('@fontsource/noto-sans-myanmar/500.css'),
  import('@fontsource/noto-sans-myanmar/600.css'),
  import('@fontsource/noto-sans-myanmar/700.css'),
  import('@fontsource/space-grotesk/400.css'),
  import('@fontsource/space-grotesk/500.css'),
  import('@fontsource/space-grotesk/600.css'),
  import('@fontsource/space-grotesk/700.css'),
]).catch(() => {});
const emptyRecord = { name:'', nrcReferenceId:'', nrcStateCode:'', nrcTownshipCode:'', nrcType:'N', nrcNumber:'', dateOfBirth:'', gender:'', crimeDate:'', crimeSection:'', crimeDetail:'', fatherName:'', address:'' };
const labels = { name:'အမည်', nrcStateCode:'တိုင်း/ပြည်နယ်ကုဒ်', nrcTownshipCode:'မြို့နယ်ကုဒ်', nrcType:'အမျိုးအစား', nrcNumber:'နံပါတ် ၆ လုံး', dateOfBirth:'မွေးသက္ကရာဇ်', gender:'လိင်', crimeDate:'ပြစ်မှုဖြစ်ပွားသည့်နေ့', crimeSection:'ပုဒ်မ', crimeDetail:'ပြစ်မှုအသေးစိတ်', fatherName:'အဘအမည်', address:'နေရပ်လိပ်စာ' };
const nrcText = (record, refs) => { const ref = refs.find((item) => String(item.id) === String(record.nrcReferenceId ?? record.nrc_reference_id)); return `${record.nrc_state_code || record.nrcStateCode}/${record.nrc_township_code || record.nrcTownshipCode}(${record.nrc_type || record.nrcType})${record.nrc_number || record.nrcNumber}${ref ? ` · ${ref.township_mm}` : ''}`; };
function Field({ name, label, value, onChange, ...props }) { return <label className="field"><span>{label || labels[name]}</span><input value={value} onChange={(event) => onChange(event.target.value)} {...props} /></label>; }
function DateField({ name, value, onChange, required = false }) {
  const [error, setError] = useState('');
  const picker = React.useRef(null);
  const validate = () => {
    if (!value) { setError(''); return; }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) { onChange(''); setError('Enter a valid date as YYYY-MM-DD.'); return; }
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
      onChange(''); setError('Enter a real calendar date as YYYY-MM-DD.'); return;
    }
    setError('');
  };
  return <label className="field date-field"><span>{labels[name]}</span><span className="date-input-row"><input className={error ? 'date-text invalid' : 'date-text'} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={value} onChange={(event) => { onChange(event.target.value); setError(''); }} onBlur={validate} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} required={required} /><span className="calendar-control"><CalendarDays size={18}/><input ref={picker} type="date" aria-label={`Choose ${labels[name]} from calendar`} value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''} onChange={(event) => { onChange(event.target.value); setError(''); }} /></span></span>{error && <small className="date-error" id={`${name}-error`}>{error}</small>}</label>;
}
function NrcPicker({ record, setRecord, refs }) { const stateRefs = refs.filter((item, index, all) => all.findIndex((other) => other.state_code === item.state_code) === index); const townshipRefs = refs.filter((item) => String(item.state_code) === String(record.nrcStateCode)); return <div className="nrc-grid"><label className="field"><span>{labels.nrcStateCode}</span><select value={record.nrcStateCode} onChange={(e) => setRecord({...record,nrcStateCode:e.target.value,nrcReferenceId:'',nrcTownshipCode:''})}><option value="">ရွေးပါ</option>{stateRefs.map((item) => <option key={item.state_code} value={item.state_code}>{item.state_code} / {item.state_mm}</option>)}</select></label><label className="field"><span>{labels.nrcTownshipCode}</span><select value={record.nrcReferenceId} onChange={(e) => { const selected = townshipRefs.find((item) => String(item.id) === e.target.value); setRecord({...record,nrcReferenceId:e.target.value,nrcTownshipCode:selected?.township_code_mm || ''}); }} disabled={!record.nrcStateCode}><option value="">ရွေးပါ</option>{townshipRefs.map((item) => <option key={item.id} value={item.id}>{item.township_code_mm} / {item.township_mm}</option>)}</select></label><label className="field"><span>{labels.nrcType}</span><select value={record.nrcType} onChange={(e) => setRecord({...record,nrcType:e.target.value})}><option value="N">နိုင်ငံသား</option><option value="E">ဧည့်နိုင်ငံသား</option><option value="P">ပြုနိုင်ငံသား</option></select></label><Field name="nrcNumber" value={record.nrcNumber} onChange={(value) => setRecord({...record,nrcNumber:value.replace(/\D/g,'').slice(0,6)})} inputMode="numeric" maxLength="6" placeholder="000000" /></div>; }
function Results({ results, refs }) { if (!results) return null; return <section className="results"><div className="section-title"><div><span className="eyebrow">ရှာဖွေမှုရလဒ်</span><h2>{results.length ? `မှတ်တမ်း ${results.length} ခု တွေ့ရှိသည်` : 'မှတ်တမ်းမတွေ့ပါ'}</h2></div></div>{results.map((record) => <article className="result" key={record.id}><div className="result-top"><strong>{record.name}</strong><span>{nrcText(record, refs)}</span></div><div className="detail-grid"><div><small>ပြစ်မှုဖြစ်ပွားသည့်နေ့</small><p>{record.crime_date?.slice(0,10)}</p></div><div><small>မွေးသက္ကရာဇ်</small><p>{record.date_of_birth?.slice(0,10) || 'မဖော်ပြထား'}</p></div><div><small>အဘအမည်</small><p>{record.father_name || 'မဖော်ပြထား'}</p></div><div><small>လိင်</small><p>{record.gender || 'မဖော်ပြထား'}</p></div></div><div className="crime-detail">{record.crime_section && <><small>ပုဒ်မ</small><p>{record.crime_section}</p></>}<small>ပြစ်မှုအသေးစိတ်</small><p>{record.crime_detail}</p>{record.address && <><small>နေရပ်လိပ်စာ</small><p>{record.address}</p></>}</div></article>)}</section>; }
function PublicSearch({ refs }) { const [record,setRecord] = useState({...emptyRecord}); const [results,setResults] = useState(null); const [error,setError] = useState(''); const search = async (event) => { event.preventDefault(); setError(''); const response = await searchCrimes({referenceId:record.nrcReferenceId,type:record.nrcType,number:record.nrcNumber},localStorage.getItem('crime_token')); if (!response.ok) setError(response.data?.message); else setResults(response.data); }; return <main><section className="hero"><div className="hero-copy"><span className="eyebrow"><ShieldCheck size={15}/> အစိုးရ အသုံးပြုရန်</span><h1>Crime<br/><em>Detector</em></h1><p>နိုင်ငံသားမှတ်ပုံတင်နံပါတ်ဖြင့် ပြစ်မှုမှတ်တမ်းကို လုံခြုံစွာ ရှာဖွေပါ။</p></div><form className="search-panel" onSubmit={search}><div className="panel-heading"><span>01</span><div><h2>NRC ဖြင့်ရှာဖွေမည်</h2><p>မှတ်ပုံတင်နံပါတ် အပြည့်အစုံကို ဖြည့်ပါ</p></div></div><NrcPicker record={record} setRecord={setRecord} refs={refs}/>{error && <div className="error">{error}</div>}<button className="primary" type="submit"><Search size={18}/> ရှာဖွေမည်</button></form></section><Results results={results} refs={refs}/></main>; }
function Admin({ refs, onLogout }) {
  const [token, setToken] = useState(localStorage.getItem('crime_token'));
  const [authMode, setAuthMode] = useState('signin');
  const [login, setLogin] = useState({ username: '', password: '' });
  const [record, setRecord] = useState({ ...emptyRecord });
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState('');
  const isAdmin = token === 'local-admin' || !OFFLINE;
  const load = async () => {
    const response = await listCrimes(token);
    if (response.ok) setRecords(response.data);
    else { localStorage.removeItem('crime_token'); setToken(null); }
  };
  useEffect(() => { if (token) load(); }, [token]);
  const doLogin = async (event) => {
    event.preventDefault();
    setMessage('');
    const response = authMode === 'admin'
      ? await adminLogin(login)
      : authMode === 'signup' ? await registerUser(login) : await userLogin(login);
    if (!response.ok) return setMessage(response.data?.message || 'Could not sign in.');
    localStorage.setItem('crime_token', response.data.token);
    setToken(response.data.token);
  };
  const save = async (event) => {
    event.preventDefault();
    const response = await createCrime(token, record);
    if (!response.ok) return setMessage(response.data?.message);
    setRecord({ ...emptyRecord }); setMessage('Record saved on this device.'); load();
  };
  const remove = async (id) => {
    if (!confirm('Delete this record?')) return;
    const response = await deleteCrime(token, id);
    if (!response.ok) setMessage(response.data?.message);
    load();
  };
  if (!token) return <main className="admin-login"><form className="search-panel" onSubmit={doLogin}>
    <span className="eyebrow"><LogIn size={15}/> DEVICE ACCOUNT</span>
    <h2>{authMode === 'signup' ? 'Create your account' : authMode === 'admin' ? 'Administrator sign in' : 'Sign in to your account'}</h2>
    {OFFLINE && <p>Accounts and records stay in this app on this phone.</p>}
    <Field name="name" label="အမည်" value={login.username} onChange={(value) => setLogin({ ...login, username: value })} placeholder="Username" autoComplete="username" required />
    <Field name="password" label="စကားဝှက်" value={login.password} onChange={(value) => setLogin({ ...login, password: value })} type="password" placeholder="Password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} required />
    {message && <div className="error">{message}</div>}
    <button className="primary">{authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
    {OFFLINE && <div className="auth-options">
      <button type="button" className="ghost" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New user? Create an account'}</button>
      <button type="button" className="ghost" onClick={() => { setAuthMode(authMode === 'admin' ? 'signin' : 'admin'); setMessage(''); }}>{authMode === 'admin' ? 'User sign in' : 'Administrator sign in'}</button>
    </div>}
  </form></main>;
  return <main className="admin-page"><div className="admin-head"><div><span className="eyebrow">{isAdmin ? 'ADMIN CONSOLE' : 'PERSONAL ACCOUNT'}</span><h1>{isAdmin ? 'Crime records' : 'My crime records'}</h1></div><button className="ghost" onClick={() => { localStorage.removeItem('crime_token'); setToken(null); onLogout(); }}>Sign out</button></div>
    <form className="admin-form" onSubmit={save}><div className="form-heading"><Plus size={20}/><h2>Add a record</h2></div>
      <div className="form-grid"><Field name="name" value={record.name} onChange={(value) => setRecord({ ...record, name: value })} required/><Field name="fatherName" value={record.fatherName} onChange={(value) => setRecord({ ...record, fatherName: value })}/><NrcPicker record={record} setRecord={setRecord} refs={refs}/><DateField name="dateOfBirth" value={record.dateOfBirth} onChange={(value) => setRecord((current) => ({ ...current, dateOfBirth: value }))}/><Field name="gender" value={record.gender} onChange={(value) => setRecord({ ...record, gender: value })} placeholder="Male / Female / Other"/><DateField name="crimeDate" value={record.crimeDate} onChange={(value) => setRecord((current) => ({ ...current, crimeDate: value }))} required/><Field name="crimeSection" value={record.crimeSection} onChange={(value) => setRecord({ ...record, crimeSection: value })} required/><Field name="address" value={record.address} onChange={(value) => setRecord({ ...record, address: value })}/><label className="field full"><span>{labels.crimeDetail}</span><textarea value={record.crimeDetail} onChange={(e) => setRecord({ ...record, crimeDetail: e.target.value })} required rows="4"/></label></div>
      {message && <div className="success">{message}</div>}<button className="primary" type="submit"><Plus size={18}/> Save record</button>
    </form><section className="admin-list"><div className="section-title"><h2>Records ({records.length})</h2></div>{records.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.name}</strong><span>{nrcText(item, refs)} · {item.crime_section ? `ပုဒ်မ ${item.crime_section} · ` : ''}{item.crime_detail}</span></div><button className="icon-button" title="Delete" onClick={() => remove(item.id)}><Trash2 size={17}/></button></div>)}</section>
  </main>;
}function App(){ const [refs,setRefs]=useState([]); const [admin,setAdmin]=useState(location.pathname.startsWith('/admin')); useEffect(()=>{getNrcReference().then(setRefs).catch(()=>setRefs([]));},[]); useEffect(()=>{ const onPopState = () => setAdmin(location.pathname.startsWith('/admin')); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); },[]); const go = (path, nextAdmin) => (event) => { event.preventDefault(); if (location.pathname !== path) history.pushState({}, '', path); setAdmin(nextAdmin); }; const logout = () => { localStorage.removeItem('crime_token'); if (location.pathname !== '/') history.pushState({}, '', '/'); setAdmin(false); }; return <><header><a className="brand" href="/" onClick={go('/', false)}>CT<span>/</span>01</a><nav><a className={!admin?'active':''} href="/" onClick={go('/', false)}>ရှာဖွေခြင်း</a><a className={admin?'active':''} href="/admin" onClick={go('/admin', true)}>အုပ်ချုပ်ရေး</a></nav><span className="status"><i/> {OFFLINE ? 'စက်အတွင်း ဒေတာသိမ်းထားသည်' : 'စနစ်အလုပ်လုပ်နေသည်'}</span></header>{admin?<Admin refs={refs} onLogout={logout}/>:<PublicSearch refs={refs}/>}<footer>Crime Detector</footer></>; }
createRoot(document.getElementById('root')).render(<App/>);
