import React from 'react';
import { AcademyLogo } from '@/components/AcademyLogo';

interface ResultCardExportTemplateProps {
  profile: any;
  exam: any;
  rows: any[];
  qrCodeDataUrl: string;
  profilePictureDataUrl: string;
}

export function ResultCardExportTemplate({ profile, exam, rows, qrCodeDataUrl, profilePictureDataUrl }: ResultCardExportTemplateProps) {
  if (!profile || !exam) return null;

  const totalMarks = rows.reduce((s, r) => s + (r.totalMarks || 0), 0);
  const obtainedMarks = rows.reduce((s, r) => s + (r.obtainedMarks || 0), 0);
  const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
  const grade = getOverallGrade(percentage);

  function getOverallGrade(pct: number) {
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
  }

  function getAvatarDataUrl(firstName: string, lastName: string, bgColor: string) {
    const cleanColor = bgColor.startsWith('#') ? bgColor : `#${bgColor}`;
    const initials = ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <rect width="256" height="256" fill="${cleanColor}"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="100" font-weight="bold">${initials}</text>
    </svg>`;
    const base64 = typeof window !== 'undefined' 
      ? btoa(encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
      : Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }

  return (
    <div 
      data-document-page
      className="w-[595px] min-h-[842px] h-auto bg-white flex flex-col items-start relative overflow-visible shrink-0"
      style={{ fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
    >
      <div className="absolute inset-0 border-[12px] border-[#1e3a8a] pointer-events-none z-20" />
      <div className="absolute inset-0 border-[16px] border-white pointer-events-none z-20" />
      
      <div className="w-full px-10 pt-8 flex flex-col h-full relative z-10">
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
          <div className="w-[300px] h-[300px]">
            <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full" />
          </div>
        </div>

        <div className="w-full flex items-center justify-between border-b-[3px] border-[#1e3a8a] pb-4">
          <div className="flex items-center gap-3">
            <AcademyLogo className="w-14 h-14 text-[#1e3a8a] shrink-0" />
            <div>
              <h2 className="text-[20px] font-black uppercase text-[#1e3a8a] leading-none tracking-tight">Evershine Academy</h2>
              <p className="text-[8.5px] text-gray-500 uppercase tracking-[0.2em] font-black mt-1">We Make your Children More Valueable</p>
              <p className="text-[7.5px] text-gray-600 mt-0.5">Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony</p>
            </div>
          </div>
          <div className="text-right text-[8px] text-gray-500 font-bold space-y-0.5">
            <p>📱 Boys: 0328-4010522</p>
            <p>📱 Girls: 0324-8985526</p>
            <p className="mt-1.5 text-indigo-600 font-mono">Date: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="w-full text-center mt-3 mb-1">
          <h1 className="text-[18px] font-black uppercase tracking-[0.2em] text-[#1e3a8a] border-b border-[#1e3a8a] inline-block pb-0.5">
            Official Result Card
          </h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{exam.name}</p>
        </div>

        <div className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50/80 mt-3 flex items-center gap-4 shadow-sm relative z-10">
          <div className="w-16 h-16 rounded-lg border-2 border-[#1e3a8a] overflow-hidden shadow flex-shrink-0 bg-white">
            <img
              src={profilePictureDataUrl || getAvatarDataUrl(profile.firstName || '', profile.lastName || '', '#1e3a8a')}
              alt={`${profile.firstName} ${profile.lastName}`}
              className="w-full h-full"
              style={{ objectFit: 'cover' }}
            />
          </div>
          <div className="flex flex-wrap text-[11px] leading-tight text-gray-800 flex-1 justify-between">
            <div className="flex flex-col w-[45%] mb-2">
              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-0.5">Student Name</span>
              <span className="font-black text-gray-900 text-[13px]">{profile.firstName} {profile.lastName}</span>
            </div>
            <div className="flex flex-col w-[45%] mb-2">
              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-0.5">Father Name</span>
              <span className="font-black text-gray-900 text-[13px]">{profile.fatherName || '—'}</span>
            </div>
            <div className="flex flex-col w-[45%] mb-2">
              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-0.5">Roll / Reg No</span>
              <span className="font-black text-[#1e3a8a] text-[13px]">{profile.registrationNumber}</span>
            </div>
            <div className="flex flex-col w-[45%] mb-2">
              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-0.5">Class & Section</span>
              <span className="font-black text-gray-900 text-[13px]">{profile.class?.name || '—'}</span>
            </div>
          </div>
        </div>

        <div className="w-full mt-4 border border-[#1e3a8a]/20 rounded-xl overflow-hidden shadow-sm relative z-10">
          <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="bg-[#1e3a8a] text-white">
                <th className="px-4 py-2 text-[10px] uppercase font-black tracking-widest border-r border-white/20">Subject Name</th>
                <th className="px-4 py-2 text-[10px] uppercase font-black tracking-widest border-r border-white/20 text-center">Max Marks</th>
                <th className="px-4 py-2 text-[10px] uppercase font-black tracking-widest border-r border-white/20 text-center">Marks Obt.</th>
                <th className="px-4 py-2 text-[10px] uppercase font-black tracking-widest text-center">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row, idx) => (
                <tr key={idx} className="bg-white">
                  <td className="px-4 py-2 text-[11px] font-bold text-gray-800 border-r border-gray-200">{row.subject?.name}</td>
                  <td className="px-4 py-2 text-[11px] font-medium text-gray-600 text-center border-r border-gray-200">{row.totalMarks}</td>
                  <td className="px-4 py-2 text-[11px] font-black text-[#1e3a8a] text-center border-r border-gray-200">{row.obtainedMarks}</td>
                  <td className="px-4 py-2 text-[11px] font-bold text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                      row.grade.startsWith('A') ? 'bg-emerald-100 text-emerald-800' :
                      row.grade.startsWith('B') ? 'bg-blue-100 text-blue-800' :
                      row.grade.startsWith('C') ? 'bg-amber-100 text-amber-800' :
                      row.grade.startsWith('D') ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>{row.grade}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-[#1e3a8a]">
                <td className="px-4 py-3 text-[11px] font-black text-gray-900 uppercase tracking-widest text-right">Grand Total</td>
                <td className="px-4 py-3 text-[12px] font-black text-gray-900 text-center">{totalMarks}</td>
                <td className="px-4 py-3 text-[12px] font-black text-[#1e3a8a] text-center">{obtainedMarks}</td>
                <td className="px-4 py-3 text-[12px] font-black text-center text-[#1e3a8a]">{grade}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="w-full mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between relative z-10">
          <div>
            <span className="text-[9px] uppercase font-black text-blue-900 tracking-widest">Aggregate Percentage</span>
            <div className="text-[18px] font-black text-[#1e3a8a] leading-none mt-0.5">{percentage.toFixed(1)}%</div>
          </div>
          <div className="text-right">
            <span className="text-[9px] uppercase font-black text-blue-900 tracking-widest">Overall Result</span>
            <div className="text-[18px] font-black text-[#1e3a8a] leading-none mt-0.5 uppercase tracking-widest">{percentage >= 50 ? 'PASS' : 'FAIL'}</div>
          </div>
        </div>

        <div className="flex-1 min-h-[16px]" />
        
        <div className="w-full flex justify-between items-end mb-4 relative z-10">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-16 h-16 border-2 border-[#1e3a8a]/30 p-1.5 rounded-lg bg-white shadow-sm flex-shrink-0">
              <img src={qrCodeDataUrl || undefined} alt="QR Verify" className="w-full h-full" />
            </div>
            <span className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Scan to Verify</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-44 border-b border-gray-400 pb-1 flex items-end justify-center h-10">
              <span className="font-serif italic text-[11px] text-gray-400">Principal Signature</span>
            </div>
            <span className="text-[9px] uppercase font-bold text-gray-600 mt-1 tracking-widest">Authorized Seal &amp; Signature</span>
          </div>
        </div>
      </div>
    </div>
  );
}
