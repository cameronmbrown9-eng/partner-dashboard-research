import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Clock, ExternalLink, Presentation, Maximize2, Minimize2, Check, CheckCircle, FileText, Mail, Phone, Download, AlertTriangle, GraduationCap, Activity, Building2, Globe, Zap, BarChart3, StickyNote, Lock, BookOpen, Target } from 'lucide-react';
import L from 'leaflet';

import { SectionCard, SkipLink, DataStamp, StatusBadge, SparkBars, fmtDate, fmtMonth } from './shared/ui.jsx';
import { ALL_PARTNERS, LISTED_PARTNERS, METRICS, EXEMPTIONS, partnersMeta, networkStats, trainingSummary, exemptionSummary, daysUntil, metricsFor, hasMobile, hasFixed, PWLLE_TRAINING_SESSIONS } from './shared/data.js';
import { NewsFeed, DocumentsSection, RelatedLinks, NetworkSummary, PwlleTrainingSessions, MapSection, ContactsSection } from './shared/sections.jsx';
import { PdfCard, ProjectPublications, BackToTop, AnnouncementBanner, TableOfContents, ProjectCountdown, ProjectTimeline } from './shared/common.jsx';
import siteNotesJson from './data/site_notes.json';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ANNOUNCEMENT_CONFIG = { isActive: false, type: 'info', message: '', link: null };

// ─── Access gate ─────────────────────────────────────────────────────────────
// The research dashboard carries internal notes and the full contact table, so
// the whole page sits behind a password. The value comes from VITE_RESEARCH_PASSWORD
// at build time (.env.local locally, a repository secret in CI). No fallback in
// source: a build without the variable shows "not configured" and nothing else.
// This is a deterrent for a shared internal link, not a substitute for per-user auth.
const RESEARCH_PASSWORD = import.meta.env.VITE_RESEARCH_PASSWORD || '';
const GATE_KEY = 'wudc-research-unlocked-v1';

const AccessGate = ({ children }) => {
  const [unlocked, setUnlocked] = useState(() => { try { return sessionStorage.getItem(GATE_KEY) === '1'; } catch (e) { return false; } });
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  if (unlocked && RESEARCH_PASSWORD) return children;
  const submit = (e) => {
    e.preventDefault();
    if (RESEARCH_PASSWORD && pw === RESEARCH_PASSWORD) {
      try { sessionStorage.setItem(GATE_KEY, '1'); } catch (err2) { /* ignore */ }
      setUnlocked(true); setErr('');
    } else {
      setErr(RESEARCH_PASSWORD ? 'Incorrect password.' : 'Access is not configured for this build (VITE_RESEARCH_PASSWORD is not set).');
      setPw(''); setTimeout(() => ref.current && ref.current.focus(), 0);
    }
  };
  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-4 border-purple-100 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-white px-6 py-5">
          <h1 className="flex items-center gap-2 font-bold text-xl"><Lock size={22} aria-hidden="true" />Research Personnel Dashboard</h1>
          <p className="text-purple-200 text-sm mt-1">Western University Drug-Checking Network · internal</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">This dashboard contains partner contact details, exemption records and internal notes. Enter the research-team password to continue.</p>
          <label className="block text-sm font-semibold text-purple-900">Password
            <input ref={ref} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className="mt-1 w-full border-2 border-purple-200 rounded-lg px-3 py-2 focus:border-purple-600 focus:outline-none" />
          </label>
          {err && <p className="text-sm text-red-700 font-medium" role="alert">{err}</p>}
          <button type="submit" className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">Open dashboard</button>
          <p className="text-xs text-gray-500">Access: Cameron Brown, Project Manager · <a className="underline" href="mailto:cbrown58@uwo.ca">cbrown58@uwo.ca</a></p>
        </div>
      </form>
    </main>
  );
};

// ─── Exemption tracker ───────────────────────────────────────────────────────
const statusTone = (e) => {
  if (e.status === 'closed') return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700', label: 'Closed' };
  if (e.status === 'pending') return { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', label: 'Pending' };
  if (e.status === 'to-confirm') return { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-800', label: 'To confirm' };
  if (e.status.startsWith('expired')) return { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', label: e.status === 'expired-renewal-submitted' ? 'Expired · renewal submitted' : 'Expired' };
  const d = daysUntil(e.validTo);
  if (d === null) return { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-800', label: 'Active' };
  if (d < 0) return { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', label: `${Math.abs(d)} d overdue` };
  if (d < 30) return { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-800', label: `${d} d left` };
  if (d < 90) return { bg: 'bg-yellow-100', border: 'border-yellow-600', text: 'text-yellow-800', label: `${d} d left` };
  if (d < 180) return { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-800', label: `${d} d left` };
  return { bg: 'bg-emerald-100', border: 'border-emerald-600', text: 'text-emerald-800', label: `${d} d left` };
};

const ExemptionRow = ({ e }) => {
  const t = statusTone(e);
  return (
    <li className={`${t.bg} border-l-4 ${t.border} rounded-lg p-4 flex justify-between items-start gap-4`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-gray-900">{e.site}</span>
          {e.type && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/80 text-gray-700 border border-gray-300">{e.type}</span>}
          {e.number && <span className="text-xs font-mono text-gray-600">{e.number}</span>}
        </div>
        {e.note && <div className="text-sm text-gray-700 mt-1">{e.note}</div>}
        {e.file && <div className="text-xs text-gray-500 mt-1 flex items-center gap-1 min-w-0"><FileText size={12} aria-hidden="true" /><span className="truncate" title={e.file}>{e.file}</span></div>}
      </div>
      <div className="text-right flex-shrink-0">
        {e.validTo && <div className="text-sm text-gray-600">Valid to {fmtDate(e.validTo)}</div>}
        <div className={`font-bold ${t.text}`}>{t.label}</div>
      </div>
    </li>
  );
};

const ExemptionTracker = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const dated = EXEMPTIONS.filter((e) => e.validTo && !['closed', 'pending', 'to-confirm'].includes(e.status)).sort((a, b) => a.validTo.localeCompare(b.validTo));
  const expired = dated.filter((e) => e.validTo < today || e.status.startsWith('expired'));
  const active = dated.filter((e) => !(e.validTo < today || e.status.startsWith('expired')));
  const toConfirm = EXEMPTIONS.filter((e) => e.status === 'to-confirm');
  const pending = EXEMPTIONS.filter((e) => e.status === 'pending');
  const closed = EXEMPTIONS.filter((e) => e.status === 'closed');
  const soon = active.filter((e) => daysUntil(e.validTo) <= 90);
  const ics = () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Western University Drug-Checking Network//Exemption renewals//EN'];
    active.forEach((e) => {
      const d = e.validTo.replace(/-/g, '');
      const reminder = new Date(e.validTo); reminder.setDate(reminder.getDate() - 90);
      const r = reminder.toISOString().slice(0, 10).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${e.number || e.site}-${d}@uwo-drugchecking.ca`, `DTSTAMP:${today.replace(/-/g, '')}T000000Z`, `DTSTART;VALUE=DATE:${r}`, `SUMMARY:Exemption renewal (90 days): ${e.site} — ${e.type}`, `DESCRIPTION:Expires ${e.validTo}${e.number ? ' · ' + e.number : ''}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exemption-renewal-reminders.ics'; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <SectionCard id="exemptions" icon={AlertTriangle} title="Exemption 56 Expiration Tracker" subtitle={`${active.length} active · ${soon.length} expiring within 90 days · ${expired.length} expired · ${pending.length + toConfirm.length} pending or to confirm · letters updated ${fmtDate(partnersMeta.lastUpdated)}`} expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)}
      actions={isExpanded && <button type="button" onClick={ics} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"><Download size={16} aria-hidden="true" />Renewal reminders (.ics)</button>}>
      <div className="p-6 space-y-6 bg-gradient-to-br from-white to-purple-50">
        <div className="flex flex-wrap gap-2">
          <a href="/Exemption-56-Template.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-lg text-sm font-medium"><FileText size={16} aria-hidden="true" />Redacted approved template</a>
          <a href="/Exemption-56-Blank.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-lg text-sm font-medium"><Download size={16} aria-hidden="true" />Blank application form</a>
          <span className="text-xs text-gray-500 self-center">Decision letters are filed in HealthCan-UWO/Legal &amp; Regulatory (file names shown on each row).</span>
        </div>
        {soon.length > 0 && <div><h3 className="font-bold text-lg text-orange-900 mb-2">Renewals due within 90 days</h3><ul className="space-y-2">{soon.map((e, i) => <ExemptionRow key={`s${i}`} e={e} />)}</ul></div>}
        <div><h3 className="font-bold text-lg text-gray-900 mb-2">Active, by expiry date</h3><ul className="space-y-2">{active.filter((e) => !soon.includes(e)).map((e, i) => <ExemptionRow key={`a${i}`} e={e} />)}</ul></div>
        <div><h3 className="font-bold text-lg text-gray-900 mb-2">Expired</h3><ul className="space-y-2">{expired.map((e, i) => <ExemptionRow key={`e${i}`} e={e} />)}</ul></div>
        <div><h3 className="font-bold text-lg text-gray-900 mb-2">To confirm (letter not on file or status unknown)</h3><ul className="space-y-2">{toConfirm.map((e, i) => <ExemptionRow key={`c${i}`} e={e} />)}</ul></div>
        <div><h3 className="font-bold text-lg text-gray-900 mb-2">Pending application or decision</h3><ul className="space-y-2">{pending.map((e, i) => <ExemptionRow key={`p${i}`} e={e} />)}</ul></div>
        {closed.length > 0 && <div><h3 className="font-bold text-lg text-gray-900 mb-2">Closed sites</h3><ul className="space-y-2">{closed.map((e, i) => <ExemptionRow key={`x${i}`} e={e} />)}</ul></div>}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Legend</h4>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 bg-red-100 border-2 border-red-500 rounded inline-block"></span>Expired</div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 bg-orange-100 border-2 border-orange-500 rounded inline-block"></span>&lt;30 days</div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 bg-yellow-100 border-2 border-yellow-600 rounded inline-block"></span>30–90 days</div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded inline-block"></span>90–180 days</div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 bg-emerald-100 border-2 border-emerald-600 rounded inline-block"></span>&gt;180 days</div>
            <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 bg-blue-50 border-2 border-blue-400 rounded inline-block"></span>To confirm</div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

// ─── Utilization (per site, last 12 months) ──────────────────────────────────
const TARGETS = { fixed: [60, 75, 100], mobile: [25, 40, 55] };
const UtilizationTable = () => {
  const rows = useMemo(() => ALL_PARTNERS.filter((p) => p.status === 'active' && !p.isLead && metricsFor(p)).map((p) => {
    const m = metricsFor(p);
    const months = m.monthly || [];
    const activeMonths = months.filter((x) => x.poc > 0).length;
    const avg = activeMonths ? Math.round((months.reduce((n, x) => n + x.poc, 0) / activeMonths) * 10) / 10 : 0;
    const kind = hasFixed(p) ? 'fixed' : 'mobile';
    return { p, m, months, activeMonths, avg, kind, target: TARGETS[kind] };
  }).sort((a, b) => b.m.pocLast12Months - a.m.pocLast12Months), []);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Point-of-care scans per partner site over the last 12 months</caption>
        <thead><tr className="bg-gradient-to-r from-purple-600 to-purple-800 text-white">{['Site', 'Type', 'Last 12 months', 'Monthly', 'Avg / active month', 'Target (min · goal · high)', 'FY to date', 'All time', 'Last scan'].map((h) => <th key={h} scope="col" className="border border-purple-300 p-2 text-left whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(({ p, m, months, avg, kind, target }, idx) => {
            const tone = avg >= target[0] ? 'text-emerald-700' : avg > 0 ? 'text-amber-700' : 'text-gray-400';
            return (
              <tr key={p.id} className={idx % 2 === 0 ? 'bg-purple-50' : 'bg-white'}>
                <td className="border border-purple-200 p-2 font-semibold text-purple-900">{p.shortName || p.nameOrganization}</td>
                <td className="border border-purple-200 p-2 capitalize">{kind}</td>
                <td className="border border-purple-200 p-2 font-bold text-right">{m.pocLast12Months.toLocaleString()}</td>
                <td className="border border-purple-200 p-2"><SparkBars series={months.map((x) => ({ key: x.month, label: fmtMonth(x.month), value: x.poc }))} label={`${p.shortName || p.nameOrganization}: scans per month, last 12 months`} /></td>
                <td className={`border border-purple-200 p-2 text-right font-bold ${tone}`}>{avg}</td>
                <td className="border border-purple-200 p-2 text-gray-600 whitespace-nowrap">{target.join(' · ')}</td>
                <td className="border border-purple-200 p-2 text-right">{m.pocFiscalYearToDate.toLocaleString()}</td>
                <td className="border border-purple-200 p-2 text-right">{m.pocAllTime.toLocaleString()}</td>
                <td className="border border-purple-200 p-2 whitespace-nowrap">{fmtDate(m.lastScan)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">Average is the site's total over the last 12 months divided by months with at least one scan; the current month is partial. Targets are the 2026 utilization thresholds (fixed 60 / 75 / 100, mobile 25 / 40 / 55 scans per month); the site agreement sets 60–80 scans per month. Scans are credited by operator login, not device.</p>
    </div>
  );
};

// ─── Performance report (computed) ───────────────────────────────────────────
const FY_FACTS = {
  'FY2024-25': { period: 'Apr 2024 – Mar 2025', facts: ['Phase 2 agreement effective 27 Jun 2024 (signed Nov 2024); Amending Agreement #1 signed 11 Mar 2025', 'Year 1 partner sites onboarded', 'Drug-Checking Peer program: focus groups and first DCP certifications at Sanguen, Grey County and RHAC (Jan–Mar 2025)', 'Ontario Community Care and Recovery Act closures affect Sanguen, Guelph CHC and Hamilton Urban Core (Mar 2025)'] },
  'FY2025-26': { period: 'Apr 2025 – Mar 2026', facts: ['Year 2 partner sites onboarded; 22 sites with 24 devices by Dec 2025', 'Paper published in Harm Reduction Journal, 8 Feb 2026', 'Phase 2 DCP certification begins (Avenue B 27 Mar 2026)', 'Ontario CTS funding change announced 13 Mar 2026; Prairie Harm Reduction exemption suspended 30 Mar 2026'] },
  'FY2026-27': { period: 'Apr 2026 – Mar 2027', facts: ['LOFT Community Services joins (agreement 12 Aug 2026); CMHA Huron Perth and BRAS Outaouais agreements executed, installs Dec 2026', 'Western mass spectrometry paused from Jul 2026 pending recruitment; Drug Analysis Service referral pathway', 'HSREB amendment approved 13 Oct 2026 (Protocol V5, device-use LOIC V3)', 'Windsor-Essex County Health Unit onboarding; Casey House prospective'] },
  'FY2027-28': { period: 'Apr 2027 – Mar 2028', facts: ['Remaining spectrometers to be assigned (plan: 28 by project end)', 'Final reporting and evaluation; sustainability planning'] },
};

const PerformanceReport = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const stats = networkStats();
  const tr = trainingSummary();
  const ex = exemptionSummary();
  const t = METRICS.totals;
  const fyNow = METRICS.fiscalYearNow;
  const fyOrder = ['FY2024-25', 'FY2025-26', 'FY2026-27', 'FY2027-28'];
  const sessionsByFy = (fy) => PWLLE_TRAINING_SESSIONS.filter((s) => s.status === 'Complete' && s.scheduledDate && fyOf(s.scheduledDate) === fy);
  const kpis = [
    { label: 'Point-of-care scans, all time', value: t.pocAllTime.toLocaleString(), icon: <Activity size={20} className="text-purple-600" aria-hidden="true" />, desc: `Since Nov 2022 · ${t.pocPhase2SinceJun27_2024.toLocaleString()} in Phase 2 (from 27 Jun 2024)` },
    { label: `Scans this fiscal year (${fyNow})`, value: t.pocFiscalYearToDate.toLocaleString(), icon: <BarChart3 size={20} className="text-indigo-600" aria-hidden="true" />, desc: `${t.pocLast12Months.toLocaleString()} in the last 12 months · ${t.sitesWithPocLast12Months} sites scanning` },
    { label: 'Partner organizations (signed)', value: stats.signedPartners, icon: <Building2 size={20} className="text-green-600" aria-hidden="true" />, desc: `${stats.activeSites - 1} operating · ${stats.plannedSites} installing Dec 2026 · ${stats.onboarding} onboarding` },
    { label: 'Spectrometers', value: `${stats.deployedDevices} / ${stats.allocatedDevices}`, icon: <Zap size={20} className="text-blue-600" aria-hidden="true" />, desc: `deployed / allocated · plan ${stats.plannedDevicesTotal} by Mar 2028` },
    { label: 'Provinces', value: stats.provinces.length, icon: <Globe size={20} className="text-indigo-600" aria-hidden="true" />, desc: stats.provinces.join(', ') },
    { label: 'PWLLE trained (unique)', value: tr.uniquePwlle, icon: <GraduationCap size={20} className="text-orange-600" aria-hidden="true" />, desc: `${tr.attendants} attendances across ${tr.sessionsComplete} sessions · last ${fmtDate(PWLLE_TRAINING_SESSIONS.filter((s) => s.status === 'Complete').map((s) => s.scheduledDate).sort().slice(-1)[0])}` },
    { label: 'Active exemptions on file', value: ex.active.length, icon: <CheckCircle size={20} className="text-green-600" aria-hidden="true" />, desc: `${ex.sitesWithActive.size} sites · ${ex.expiringSoon.length} expiring within 90 days · ${ex.pending.length} pending · ${ex.toConfirm.length} to confirm` },
    { label: 'Peer-reviewed publications', value: '1', icon: <BookOpen size={20} className="text-purple-600" aria-hidden="true" />, desc: 'Harm Reduction Journal, Feb 2026; a second manuscript in revision' },
  ];
  return (
    <SectionCard id="performance" icon={BarChart3} title="Performance Report" subtitle={`Computed from the 13 Oct 2026 data pull · fiscal year ${fyNow} in progress`} expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)}>
      <div className="p-6 bg-gradient-to-br from-white to-purple-50 space-y-8">
        <div>
          <h3 className="font-bold text-lg text-purple-900 mb-4 flex items-center gap-2"><Target size={18} aria-hidden="true" />Key figures</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((m) => (
              <div key={m.label} className="bg-white rounded-xl border-2 border-purple-200 p-4">
                <div className="flex items-center gap-3 mb-2">{m.icon}<span className="text-sm font-semibold text-gray-700">{m.label}</span></div>
                <div className="text-3xl font-black text-purple-900 mb-1">{m.value}</div>
                <div className="text-xs text-gray-500">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-bold text-lg text-purple-900 mb-4 flex items-center gap-2"><Activity size={18} aria-hidden="true" />Site utilization, last 12 months</h3>
          <UtilizationTable />
        </div>
        <div>
          <h3 className="font-bold text-lg text-purple-900 mb-4 flex items-center gap-2"><Clock size={18} aria-hidden="true" />Fiscal years</h3>
          <div className="space-y-4">
            {fyOrder.map((fy) => {
              const status = fy < fyNow ? 'complete' : fy === fyNow ? 'current' : 'upcoming';
              const f = FY_FACTS[fy];
              const poc = t.pocByFiscalYear[fy] || 0;
              const sess = sessionsByFy(fy);
              return (
                <div key={fy} className={`rounded-xl border-2 p-4 ${status === 'current' ? 'border-purple-400 bg-purple-50' : status === 'complete' ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${status === 'current' ? 'bg-purple-700 text-white' : status === 'complete' ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'}`}>{status.toUpperCase()}</span>
                    <span className="font-bold text-gray-900">{fy}</span>
                    <span className="text-sm text-gray-600">{f.period}</span>
                    <span className="ml-auto text-sm text-gray-700"><strong>{poc.toLocaleString()}</strong> point-of-care scans{status === 'current' ? ' to date' : ''} · <strong>{sess.length}</strong> DCP sessions ({sess.reduce((n, s) => n + (s.newAttendants || 0), 0)} unique PWLLE)</span>
                  </div>
                  <ul className="space-y-1 ml-4">{f.facts.map((h) => <li key={h} className="text-sm text-gray-700 flex items-start gap-2"><span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${status === 'current' ? 'bg-purple-500' : status === 'complete' ? 'bg-green-500' : 'bg-gray-400'}`}></span>{h}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
          <h3 className="font-bold text-yellow-900 mb-2 flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-600" aria-hidden="true" />Open items affecting the figures</h3>
          <ul className="space-y-2 text-sm text-yellow-900">
            <li>Mass spectrometry at Western paused since Jul 2026; no laboratory confirmations since then (Drug Analysis Service limit 20 samples per month).</li>
            <li>{ex.expiringSoon.length} active exemption{ex.expiringSoon.length === 1 ? '' : 's'} expire within 90 days ({ex.expiringSoon.map((e) => e.site).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'none'}); {ex.expired.length} expired with renewals submitted.</li>
            <li>Sites with a device but no scans in the last 12 months: {METRICS.sites.filter((s) => s.known && s.pocLast12Months === 0 && ALL_PARTNERS.some((p) => p.username === s.username && p.status === 'active')).map((s) => s.site).join(', ') || 'none'}.</li>
            <li>Training sessions held after 10 Apr 2026 other than AIDS New Brunswick (31 Jul) are not yet recorded in the tracker.</li>
          </ul>
        </div>
        <DataStamp metrics={METRICS} partners={partnersMeta} />
      </div>
    </SectionCard>
  );
};

const fyOf = (iso) => { const [y, m] = iso.split('-').map(Number); const fy = m >= 4 ? y : y - 1; return `FY${fy}-${String(fy + 1).slice(2)}`; };

// ─── Site notes & action items ───────────────────────────────────────────────
const SiteNotes = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const styles = {
    high: { bg: 'bg-red-50', border: 'border-red-300', badge: 'bg-red-100 text-red-700', label: 'Action' },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-300', badge: 'bg-yellow-100 text-yellow-700', label: 'Monitor' },
    low: { bg: 'bg-blue-50', border: 'border-blue-300', badge: 'bg-blue-100 text-blue-700', label: 'Info' },
  };
  const order = { high: 0, medium: 1, low: 2 };
  const notes = [...siteNotesJson.notes].sort((a, b) => (order[a.priority] - order[b.priority]) || ((a.due || '9') > (b.due || '9') ? 1 : -1));
  const dueSoon = notes.filter((n) => n.due && daysUntil(n.due) <= 30);
  return (
    <SectionCard id="site-notes" icon={StickyNote} title="Site Notes & Action Items" subtitle={`Internal · ${notes.filter((n) => n.priority === 'high').length} action items · updated ${fmtDate(siteNotesJson.lastUpdated)}`} expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)}>
      <div className="p-6 bg-gradient-to-br from-white to-purple-50 space-y-3">
        {dueSoon.length > 0 && <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-3 text-sm text-orange-900"><strong>Due within 30 days:</strong> {dueSoon.map((n) => `${n.site} (${fmtDate(n.due)})`).join(' · ')}</div>}
        {notes.map((s, i) => {
          const st = styles[s.priority] || styles.low;
          return (
            <article key={i} className={`${st.bg} border-2 ${st.border} rounded-xl p-4`}>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${st.badge}`}>{st.label}</span>
                <span className="font-bold text-gray-900">{s.site}</span>
                {s.owner && <span className="text-xs text-gray-600">Owner: {s.owner}</span>}
                {s.due && <span className="text-xs text-gray-600">Due {fmtDate(s.due)}</span>}
              </div>
              <ul className="space-y-1 ml-4">{s.items.map((n, j) => <li key={j} className="text-sm text-gray-700 flex items-start gap-2"><span aria-hidden="true" className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-400"></span>{n}</li>)}</ul>
            </article>
          );
        })}
        <p className="text-xs text-gray-500 mt-4">Internal research-team notes; source is the weekly meeting agenda. Edit src/data/site_notes.json to update.</p>
      </div>
    </SectionCard>
  );
};

// ─── DCP training status by site (derived from the sessions table) ───────────
const TrainingTracker = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const tr = trainingSummary();
  const sites = ALL_PARTNERS.filter((p) => !p.isLead && p.status !== 'closed');
  const matchSite = (p) => Object.values(tr.bySite).find((e) => e.site === p.nameOrganization || e.site === p.shortName || (p.nameOrganization || '').startsWith(e.site.split(' (')[0]) || e.site.startsWith((p.shortName || '').split(' (')[0]));
  const done = sites.filter((p) => matchSite(p)?.certified);
  return (
    <SectionCard id="training-status" icon={GraduationCap} title="Drug-Checking Peer (DCP) Training Status by Site" subtitle={`${done.length} of ${sites.length} partner organizations have completed a DCP certification session`} expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)}>
      <div className="p-6 bg-gradient-to-br from-white to-purple-50">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-purple-900">Network training progress</span><span className="text-sm font-bold text-purple-700">{done.length} of {sites.length} ({Math.round((done.length / sites.length) * 100)}%)</span></div>
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={done.length} aria-valuemin={0} aria-valuemax={sites.length}><div className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full" style={{ width: `${(done.length / sites.length) * 100}%` }}></div></div>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sites.map((p) => {
            const e = matchSite(p);
            const ok = !!e?.certified;
            return (
              <li key={p.id} className={`p-3 rounded-xl border-2 flex items-center gap-3 ${ok ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`} aria-hidden="true">{ok ? <Check size={18} /> : <Clock size={18} />}</div>
                <div className="min-w-0">
                  <div className={`font-medium text-sm truncate ${ok ? 'text-green-900' : 'text-gray-700'}`}>{p.nameOrganization}</div>
                  <div className="text-xs text-gray-500">{ok ? (e.unique > 0 ? `${e.unique} unique PWLLE · last session ${fmtDate(e.lastDate)}` : `certification session ${fmtDate(e.lastDate)} · attendance to enter`) : e ? `${e.sessions} session(s), certification pending` : 'No session yet'}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
};

const RESEARCH_TOC = [
  { id: 'performance', label: 'Performance Report' },
  { id: 'exemptions', label: 'Exemption 56 Tracker' },
  { id: 'site-notes', label: 'Site Notes & Action Items' },
  { id: 'news', label: 'News & Updates' },
  { id: 'metrics', label: 'Network Summary & Analytics' },
  { id: 'map', label: 'Interactive Map View of Partner Sites' },
  { id: 'table', label: 'Complete Partner Data' },
  { id: 'pwlle-sessions', label: 'PWLLE Training Sessions' },
  { id: 'training-status', label: 'DCP Training Status by Site' },
  { id: 'timeline', label: 'Project Timeline' },
  { id: 'publications', label: 'Project-Related Publications' },
  { id: 'presentation', label: 'Project Overview Presentation' },
  { id: 'scatr-research', label: 'Scatr Technical Research Strategy' },
  { id: 'documents', label: 'Research, Ethics & Exemptions Documents' },
  { id: 'links', label: 'Related Links & Resources' },
];

const PresentationCard = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInline, setShowInline] = useState(false);
  const pptxUrl = 'https://partners.uwo-drugchecking.ca/project-presentation.pptx';
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptxUrl)}`;
  return (
    <SectionCard id="presentation" icon={Presentation} title="Project Overview Presentation" expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)}>
      <div className="p-6 bg-gradient-to-br from-white to-purple-50">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <a href={pptxUrl} download className="inline-flex items-center gap-2 bg-purple-700 text-white px-4 py-2 rounded-lg hover:bg-purple-800 text-sm font-medium"><Download size={16} aria-hidden="true" />Download PowerPoint</a>
          <button type="button" onClick={() => setShowInline(!showInline)} aria-expanded={showInline} className="inline-flex items-center gap-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-lg hover:bg-purple-200 text-sm font-medium">{showInline ? 'Hide preview' : 'Preview here (Office viewer)'}</button>
        </div>
        {showInline && <div className="h-[600px] w-full rounded-lg overflow-hidden border-2 border-purple-200 shadow-lg"><iframe src={embedUrl} width="100%" height="100%" frameBorder="0" allowFullScreen title="Project presentation" className="bg-white" /></div>}
      </div>
    </SectionCard>
  );
};

const ResearchDashboard = () => {
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const todayFormatted = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
  const stats = networkStats();
  return (
    <div className="min-h-screen bg-white" id="top">
      <SkipLink />
      <BackToTop />
      {showAnnouncement && <AnnouncementBanner config={ANNOUNCEMENT_CONFIG} onDismiss={() => setShowAnnouncement(false)} />}
      <header className="bg-white shadow-lg">
        <div className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
            <img src="/western-logo.png" alt="Western University" className="h-32 sm:h-44 lg:h-56 w-auto self-start md:self-center" />
            <div className="flex flex-col justify-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-black leading-tight">A Novel Concurrent Two Phase<br />Drug-Checking Initiative</h1>
              <div className="border-b-2 border-gray-300 my-2"></div>
              <p className="text-base sm:text-lg md:text-xl text-black font-medium">Research Personnel Dashboard · Health Canada SUAP Agreement #2425-HQ-000058</p>
              <p className="text-base mt-1">In partnership with <a href="https://scatr.ca/" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:text-blue-800 hover:underline">Scatr Inc.</a></p>
              <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  [stats.signedPartners, 'Partner organizations'],
                  [stats.deployedDevices, 'Spectrometers deployed'],
                  [METRICS.totals.pocFiscalYearToDate.toLocaleString(), `Scans ${METRICS.fiscalYearNow}`],
                  [METRICS.totals.pocAllTime.toLocaleString(), 'Scans all time'],
                ].map(([v, l]) => (
                  <div key={l} className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2"><dt className="text-xs text-purple-700 font-semibold uppercase tracking-wide">{l}</dt><dd className="text-2xl font-black text-purple-900">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <div className="h-24 bg-purple-800"></div>
      </header>
      <main id="main">
        <ProjectCountdown />
        <div className="px-6 pt-6">
          <section aria-labelledby="overview-h" className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-2xl shadow-lg border-2 border-purple-200">
            <h2 id="overview-h" className="text-3xl font-bold text-purple-900 mb-4">Overview</h2>
            <p className="text-gray-800 leading-relaxed">As of <strong>{todayFormatted}</strong>: {stats.signedPartners} partner organizations under signed agreements in {stats.provinces.length} provinces; {stats.deployedDevices} spectrometers deployed at {stats.activeSites - 1} partner sites plus Western's laboratory; {stats.plannedSites} further installs scheduled for December 2026 and {stats.onboarding} organization onboarding. Point-of-care scans: {METRICS.totals.pocAllTime.toLocaleString()} since Nov 2022, {METRICS.totals.pocFiscalYearToDate.toLocaleString()} in {METRICS.fiscalYearNow}.</p>
            <DataStamp metrics={METRICS} partners={partnersMeta} className="mt-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-white p-4 rounded-xl border border-purple-200">
                <div className="font-bold text-purple-900 mb-2">Principal Investigator (PI):</div>
                <div className="text-gray-800 font-medium">Professor Francois Lagugne-Labarthet</div>
                <div className="text-gray-600">Faculty of Science, Western University · London, ON</div>
                <div className="flex items-center gap-2 mt-2 text-purple-700"><Phone size={14} aria-hidden="true" /><span>519-661-2111 x81006</span></div>
                <div className="flex items-center gap-2 text-purple-700"><Mail size={14} aria-hidden="true" /><a href="mailto:flagugne@uwo.ca" className="hover:underline">flagugne@uwo.ca</a></div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-purple-200">
                <div className="font-bold text-purple-900 mb-2">Project Manager:</div>
                <div className="text-gray-800 font-medium">Cameron Brown</div>
                <div className="text-gray-600">Faculty of Science, Western University · London, ON</div>
                <div className="flex items-center gap-2 mt-2 text-purple-700"><Phone size={14} aria-hidden="true" /><span>226-238-9970</span></div>
                <div className="flex items-center gap-2 text-purple-700"><Mail size={14} aria-hidden="true" /><a href="mailto:cbrown58@uwo.ca" className="hover:underline">cbrown58@uwo.ca</a></div>
              </div>
            </div>
          </section>
        </div>
        <div className="h-24 bg-purple-800 mt-6"></div>
        <div className="text-center py-6 bg-white"><h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-purple-900 tracking-tight">Research Personnel Dashboard</h2></div>
        <div className="px-6 pb-4">
          <div className="bg-gradient-to-br from-purple-100 to-white p-6 rounded-2xl shadow-lg border-2 border-purple-200">
            <p className="text-gray-800 leading-relaxed">Internal view for the Western research team: partner data, exemption tracking, utilization, training status and project documentation. Not for distribution outside the team.</p>
            <TableOfContents sections={RESEARCH_TOC} />
          </div>
        </div>
        <div className="p-6 space-y-6">
          <PerformanceReport />
          <ExemptionTracker />
          <SiteNotes />
          <NewsFeed expandedDefault />
          <NetworkSummary expandedDefault />
          <MapSection expandedDefault showMetrics />
          <ContactsSection expandedDefault showMetrics title="Complete Partner Data" />
          <PwlleTrainingSessions expandedDefault />
          <TrainingTracker />
          <ProjectTimeline />
          <ProjectPublications />
          <PresentationCard />
          <PdfCard id="scatr-research" title="Scatr Technical Research Strategy" url="https://partners.uwo-drugchecking.ca/Scatr-Technical-Research-Strategy.pdf" summary="Scatr Inc.'s technical research strategy for the Series One platform." />
          <DocumentsSection expandedDefault />
          <RelatedLinks />
          <footer className="pt-4 border-t border-purple-100"><DataStamp metrics={METRICS} partners={partnersMeta} /></footer>
        </div>
      </main>
    </div>
  );
};

const App = () => (
  <AccessGate>
    <ResearchDashboard />
  </AccessGate>
);

export default App;
