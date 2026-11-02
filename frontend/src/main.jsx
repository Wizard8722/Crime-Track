import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ShieldCheck, LogIn, Trash2, Plus, CalendarDays } from 'lucide-react';
import './styles.css';

import { OFFLINE, getNrcReference, searchCrimes, searchCrimesByFace, adminLogin, registerUser, userLogin, getProfile, listAccounts, manageAccount, changePassword, listCrimes, createCrime, deleteCrime } from './api.js';

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
const emptyRecord = { name:'', nrcReferenceId:'', nrcStateCode:'', nrcTownshipCode:'', nrcType:'N', nrcNumber:'', dateOfBirth:'', gender:'', crimeDate:'', crimeSection:'', crimeDetail:'', crimeDetailText:'', crimePdfName:'', crimePdfData:'', crimePhotoName:'', crimePhotoData:'', faceSignature:'', fatherName:'', address:'' };
const labels = { name:'အမည်', nrcStateCode:'တိုင်း/ပြည်နယ်ကုဒ်', nrcTownshipCode:'မြို့နယ်ကုဒ်', nrcType:'အမျိုးအစား', nrcNumber:'နံပါတ် ၆ လုံး', dateOfBirth:'မွေးသက္ကရာဇ်', gender:'လိင်', crimeDate:'ပြစ်မှုဖြစ်ပွားသည့်နေ့', crimeSection:'ပုဒ်မ', crimeDetail:'ပြစ်မှုအသေးစိတ် ခေါင်းစဉ်', crimeDetailText:'အကြောင်းအရာ စာသား', fatherName:'အဘအမည်', address:'နေရပ်လိပ်စာ' };
const computeFaceSignature = (dataUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 17;
    canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 17, 16);
    const pixels = context.getImageData(0, 0, 17, 16).data;
    let binary = '';
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const index = (y * 17 + x) * 4;
        const nextIndex = (y * 17 + x + 1) * 4;
        const light = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
        const nextLight = pixels[nextIndex] * 0.299 + pixels[nextIndex + 1] * 0.587 + pixels[nextIndex + 2] * 0.114;
        binary += light < nextLight ? '1' : '0';
      }
    }
    resolve(binary.match(/.{1,4}/g).map((bits) => parseInt(bits, 2).toString(16)).join('').padStart(64, '0'));
  };
  image.onerror = () => reject(new Error('Unable to read the face photo.'));
  image.src = dataUrl;
});
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
function FilePicker({ label, accept, dataName, fileName, value, onChange }) {
  const choose = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert('File must be 10 MB or smaller.');
    const reader = new FileReader();
    reader.onload = () => onChange({ [dataName]: String(reader.result || ''), [fileName]: file.name });
    reader.readAsDataURL(file);
  };
  return <label className="field file-field"><span>{label}</span><input type="file" accept={accept} onChange={choose}/>{value && <small>Selected: {value}</small>}</label>;
}
function Results({ results, refs }) {
  if (!results) return null;
  return <section className="results"><div className="section-title"><div><span className="eyebrow">ရှာဖွေမှုရလဒ်</span><h2>{results.length ? `မှတ်တမ်း ${results.length} ခု တွေ့ရှိသည်` : 'မှတ်တမ်းမတွေ့ပါ'}</h2></div></div>
    {results.map((record) => <article className="result" key={record.id}><div className="result-top"><strong>{record.name}</strong><span>{nrcText(record, refs)}</span></div>
      <div className="detail-grid"><div><small>ပြစ်မှုဖြစ်ပွားသည့်နေ့</small><p>{record.crime_date?.slice(0,10)}</p></div><div><small>မွေးသက္ကရာဇ်</small><p>{record.date_of_birth?.slice(0,10) || 'မဖော်ပြထား'}</p></div><div><small>အဘအမည်</small><p>{record.father_name || 'မဖော်ပြထား'}</p></div><div><small>လိင်</small><p>{record.gender || 'မဖော်ပြထား'}</p></div></div>
      <div className="crime-detail">{record.crime_section && <><small>ပုဒ်မ</small><p>{record.crime_section}</p></>}
        <small>ပြစ်မှုအသေးစိတ် ခေါင်းစဉ်</small><p><strong>{record.crime_detail}</strong></p>
        {(record.crime_detail_text || '') && <><small>အကြောင်းအရာ</small><p>{record.crime_detail_text}</p></>}
        {record.crime_pdf_data && <><small>PDF ဖိုင်</small><p><a href={record.crime_pdf_data} download={record.crime_pdf_name || 'crime-detail.pdf'}>{record.crime_pdf_name || 'Download PDF'}</a></p></>}
        {record.crime_photo_data && <><small>လူပုံ</small><p><a href={record.crime_photo_data} target="_blank" rel="noreferrer"><img className="crime-photo" src={record.crime_photo_data} alt={record.crime_photo_name || 'Crime subject'}/></a></p></>}
        {record.address && <><small>နေရပ်လိပ်စာ</small><p>{record.address}</p></>}
      </div>
    </article>)}
  </section>;
}
function PublicSearch({ refs }) {
  const [record,setRecord] = useState({...emptyRecord});
  const [results,setResults] = useState(null);
  const [error,setError] = useState('');
  const [faceName,setFaceName] = useState('');
  const [facePhoto,setFacePhoto] = useState('');
  const [facePhotoName,setFacePhotoName] = useState('');
  const [signature,setSignature] = useState('');
  const search = async (event) => {
    event.preventDefault(); setError('');
    const response = await searchCrimes({referenceId:record.nrcReferenceId,type:record.nrcType,number:record.nrcNumber});
    if (!response.ok) setError(response.data?.message); else setResults(response.data);
  };
  const chooseFace = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError('Face photo must be 10 MB or smaller.');
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setFacePhoto(dataUrl); setFacePhotoName(file.name); setError('');
      try { setSignature(await computeFaceSignature(dataUrl)); } catch { setError('Unable to read the face photo.'); }
    };
    reader.readAsDataURL(file);
  };
  const faceSearch = async (event) => {
    event.preventDefault(); setError('');
    if (!signature) return setError('Select a human face photo first.');
    const response = await searchCrimesByFace({ signature, name: faceName });
    if (!response.ok) setError(response.data?.message); else setResults(response.data);
  };
  return <main><section className="hero"><div className="hero-copy"><span className="eyebrow"><ShieldCheck size={15}/> အစိုးရ အသုံးပြုရန်</span><h1>Crime<br/><em>Detector</em></h1><p>NRC နံပါတ် သို့မဟုတ် လူပုံဖြင့် ပြစ်မှုမှတ်တမ်းကို ရှာဖွေပါ။</p></div>
    <div className="search-panel-stack">
      <form className="search-panel" onSubmit={search}><div className="panel-heading"><span>01</span><div><h2>NRC ဖြင့်ရှာဖွေမည်</h2><p>မှတ်ပုံတင်နံပါတ် အပြည့်အစုံကို ဖြည့်ပါ</p></div></div><NrcPicker record={record} setRecord={setRecord} refs={refs}/>{error && <div className="error">{error}</div>}<button className="primary" type="submit"><Search size={18}/> ရှာဖွေမည်</button></form>
      <form className="search-panel" onSubmit={faceSearch}><div className="panel-heading"><span>02</span><div><h2>Face Scan ဖြင့်ရှာဖွေမည်</h2><p>လူပုံနှင့် အမည်ဖြင့် ရှာဖွေပါ</p></div></div><Field name="faceName" label="ဖြစ်စဉ်ရှိ အမည်" value={faceName} onChange={setFaceName} placeholder="Criminal name"/><label className="field file-field"><span>Human face photo</span><input type="file" accept="image/*" capture="environment" onChange={chooseFace}/>{facePhotoName && <small>Selected: {facePhotoName}</small>}</label>{facePhoto && <img className="face-preview" src={facePhoto} alt="Scanned face"/>}{error && <div className="error">{error}</div>}<button className="primary" type="submit"><Search size={18}/> Face ဖြင့်ရှာဖွေမည်</button></form>
    </div>
  </section><Results results={results} refs={refs}/></main>;
}
function Admin({ refs, onLogout }) {
  const [token, setToken] = useState(localStorage.getItem('crime_token'));
  const [authMode, setAuthMode] = useState('signin');
  const [login, setLogin] = useState({ username: '', password: '' });
  const [record, setRecord] = useState({ ...emptyRecord });
  const [records, setRecords] = useState([]);
  const [profile, setProfile] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [message, setMessage] = useState('');
  const isAdmin = profile?.role === 'admin' || token === 'local-admin';
  const load = async () => {
    const profileResponse = await getProfile(token);
    if (!profileResponse.ok) { localStorage.removeItem('crime_token'); setToken(null); return; }
    setProfile(profileResponse.data);
    if (profileResponse.data.role === 'admin') {
      const response = await listCrimes(token);
      if (response.ok) setRecords(response.data);
      else setRecords([]);
    } else setRecords([]);
  };
  const loadAccounts = async () => {
    const response = await listAccounts(token);
    if (response.ok) setAccounts(response.data);
  };
  useEffect(() => { if (token) { load(); } }, [token]);
  useEffect(() => { if (token && isAdmin) loadAccounts(); }, [token, profile?.role]);
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
  const changeMyPassword = async (event) => {
    event.preventDefault();
    const response = await changePassword(token, passwords.current, passwords.next);
    if (response.ok) { setPasswords({ current: '', next: '' }); setMessage('Password changed successfully.'); }
    else setMessage(response.data?.message);
  };
  const manage = async (accountId, action) => {
    const response = await manageAccount(token, accountId, action);
    if (!response.ok) return setMessage(response.data?.message);
    setMessage(action === 'delete' ? 'Account deleted.' : 'Account permission updated.');
    loadAccounts();
  };
  if (!token) return <main className="admin-login"><form className="search-panel" onSubmit={doLogin}>
    <span className="eyebrow"><LogIn size={15}/> DEVICE ACCOUNT</span>
    <h2>{authMode === 'signup' ? 'Create your account' : authMode === 'admin' ? 'Administrator sign in' : 'Sign in to your account'}</h2>
    {OFFLINE && <p>Accounts and records stay in this app on this phone.</p>}
    <Field name="name" label="အမည်" value={login.username} onChange={(value) => setLogin({ ...login, username: value })} placeholder="Username" autoComplete="username" required />
    <Field name="password" label="စကားဝှက်" value={login.password} onChange={(value) => setLogin({ ...login, password: value })} type="password" placeholder="Password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} required />
    {message && <div className="error">{message}</div>}
    <button className="primary">{authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
    <div className="auth-options">
      <button type="button" className="ghost" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New user? Create an account'}</button>
      <button type="button" className="ghost" onClick={() => { setAuthMode(authMode === 'admin' ? 'signin' : 'admin'); setMessage(''); }}>{authMode === 'admin' ? 'User sign in' : 'Administrator sign in'}</button>
    </div>
  </form></main>;
  return <main className="admin-page"><div className="admin-head"><div><span className="eyebrow">{isAdmin ? 'ADMIN CONSOLE' : 'NORMAL ACCOUNT'}</span><h1>{isAdmin ? 'Dashboard' : 'Account profile'}</h1></div><button className="ghost" onClick={() => { localStorage.removeItem('crime_token'); setToken(null); onLogout(); }}>Sign out</button></div>
    <section className="profile-grid">
      <form className="admin-form" onSubmit={changeMyPassword}>
        <div className="form-heading"><LogIn size={20}/><h2>Profile</h2></div>
        <Field name="profileName" label="Account name" value={profile?.username || ''} onChange={() => {}} disabled />
        <Field name="currentPassword" label="Current password" value={passwords.current} onChange={(value) => setPasswords({ ...passwords, current: value })} type="password" required />
        <Field name="newPassword" label="New password" value={passwords.next} onChange={(value) => setPasswords({ ...passwords, next: value })} type="password" required />
        <button className="primary" type="submit">Change password</button>
      </form>
      {isAdmin && <div className="dashboard-cards"><article><small>Total user accounts</small><strong>{accounts.length}</strong></article><article><small>Crime records</small><strong>{records.length}</strong></article></div>}
    </section>
    {message && <div className={message.includes('success') || message.includes('saved') ? 'success' : 'error'}>{message}</div>}
    {isAdmin && <><form className="admin-form" onSubmit={save}><div className="form-heading"><Plus size={20}/><h2>Add a record</h2></div>
      <div className="form-grid">
        <Field name="name" value={record.name} onChange={(value) => setRecord({ ...record, name: value })} required/>
        <Field name="fatherName" value={record.fatherName} onChange={(value) => setRecord({ ...record, fatherName: value })}/>
        <NrcPicker record={record} setRecord={setRecord} refs={refs}/>
        <DateField name="dateOfBirth" value={record.dateOfBirth} onChange={(value) => setRecord((current) => ({ ...current, dateOfBirth: value }))}/>
        <label className="field"><span>{labels.gender}</span><select value={record.gender} onChange={(event) => setRecord({ ...record, gender: event.target.value })}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></label>
        <DateField name="crimeDate" value={record.crimeDate} onChange={(value) => setRecord((current) => ({ ...current, crimeDate: value }))} required/>
        <Field name="crimeSection" value={record.crimeSection} onChange={(value) => setRecord({ ...record, crimeSection: value })} required/>
        <Field name="address" value={record.address} onChange={(value) => setRecord({ ...record, address: value })}/>
        <label className="field full"><span>{labels.crimeDetail}</span><input value={record.crimeDetail} onChange={(event) => setRecord({ ...record, crimeDetail: event.target.value })} required placeholder="Crime detail title"/></label>
        <label className="field full"><span>{labels.crimeDetailText}</span><textarea value={record.crimeDetailText} onChange={(event) => setRecord({ ...record, crimeDetailText: event.target.value })} rows="4" placeholder="Crime text details"/></label>
        <FilePicker label="PDF document" accept="application/pdf,.pdf" dataName="crimePdfData" fileName="crimePdfName" value={record.crimePdfName} onChange={(files) => setRecord((current) => ({ ...current, ...files }))}/>
        <FilePicker label="Human photo" accept="image/*" dataName="crimePhotoData" fileName="crimePhotoName" value={record.crimePhotoName} onChange={async (files) => { const signature = files.crimePhotoData ? await computeFaceSignature(files.crimePhotoData) : ''; setRecord((current) => ({ ...current, ...files, faceSignature: signature })); }}/>
      </div>
      {message && <div className="success">{message}</div>}<button className="primary" type="submit"><Plus size={18}/> Save record</button>
    </form><section className="admin-list"><div className="section-title"><h2>Account management ({accounts.length})</h2></div>{accounts.map((account) => <div className="admin-row" key={account.id}><div><strong>{account.username}</strong><span>{account.role === 'admin' ? 'Administrator' : 'Normal account'}</span></div><div className="account-actions"><button className="ghost" type="button" onClick={() => manage(account.id, account.role === 'admin' ? 'demote' : 'promote')}>{account.role === 'admin' ? 'Demote' : 'Make admin'}</button><button className="icon-button" title="Delete account" onClick={() => { if (confirm('Delete this account?')) manage(account.id, 'delete'); }}><Trash2 size={17}/></button></div></div>)}</section></>}
    {isAdmin && <section className="admin-list"><div className="section-title"><h2>Records ({records.length})</h2></div>{records.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.name}</strong><span>{nrcText(item, refs)} · {item.crime_section ? `ပုဒ်မ ${item.crime_section} · ` : ''}{item.crime_detail}</span><span>{item.crime_detail_text || ''}{item.crime_pdf_name ? ` · PDF: ${item.crime_pdf_name}` : ''}{item.crime_photo_name ? ` · Photo: ${item.crime_photo_name}` : ''}</span></div><button className="icon-button" title="Delete" onClick={() => remove(item.id)}><Trash2 size={17}/></button></div>)}</section>}
  </main>;
}function App(){ const [refs,setRefs]=useState([]); const [admin,setAdmin]=useState(location.pathname.startsWith('/admin')); useEffect(()=>{getNrcReference().then(setRefs).catch(()=>setRefs([]));},[]); useEffect(()=>{ const onPopState = () => setAdmin(location.pathname.startsWith('/admin')); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); },[]); const go = (path, nextAdmin) => (event) => { event.preventDefault(); if (location.pathname !== path) history.pushState({}, '', path); setAdmin(nextAdmin); }; const logout = () => { localStorage.removeItem('crime_token'); if (location.pathname !== '/') history.pushState({}, '', '/'); setAdmin(false); }; return <><header><a className="brand" href="/" onClick={go('/', false)}>CT<span>/</span>01</a><nav><a className={!admin?'active':''} href="/" onClick={go('/', false)}>ရှာဖွေခြင်း</a><a className={admin?'active':''} href="/admin" onClick={go('/admin', true)}>အုပ်ချုပ်ရေး</a></nav><span className="status"><i/> {OFFLINE ? 'စက်အတွင်း ဒေတာသိမ်းထားသည်' : 'စနစ်အလုပ်လုပ်နေသည်'}</span></header>{admin?<Admin refs={refs} onLogout={logout}/>:<PublicSearch refs={refs}/>}<footer>Crime Detector</footer></>; }
createRoot(document.getElementById('root')).render(<App/>);
