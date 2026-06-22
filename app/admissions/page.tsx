import Link from 'next/link'
import { ArrowRight, BookOpen, Users, Trophy } from 'lucide-react'
import { AcademyLogo } from '@/components/AcademyLogo'

export default function AdmissionsLandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white py-4 px-6 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AcademyLogo variant="compact" theme="dark" className="h-9" />
          </div>
          <Link href="/login" className="text-sm font-medium hover:text-blue-200 transition-colors">
            Portal Login
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="bg-gradient-to-b from-blue-900 to-blue-800 text-white py-20 px-6 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <span className="inline-block px-4 py-1.5 rounded-full bg-blue-800 border border-blue-700 text-xs font-bold tracking-widest uppercase text-blue-200">
              Admissions Open 2025-2026
            </span>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
              Shape Your Future With Excellence
            </h2>
            <p className="text-lg md:text-xl text-blue-200 max-w-2xl mx-auto leading-relaxed">
              Join Evershine Academy. We are committed to providing top-tier academic excellence, holistic character development, and a state-of-the-art learning environment.
            </p>
            <div className="pt-6">
              <Link href="/admissions/apply" className="inline-flex items-center justify-center bg-white text-blue-900 font-bold px-8 py-4 rounded-full text-lg hover:bg-blue-50 transition-transform hover:scale-105 active:scale-95 shadow-xl gap-2">
                Apply Online Now <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Admission Highlights */}
        <section className="bg-slate-50 py-16 px-6">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">What students provide</h3>
              <ul className="space-y-4 text-sm text-slate-600">
                <li><span className="font-semibold text-slate-800">1. Class & Course Selection</span> – Choose your academic level, requested class, and one or more course groups.</li>
                <li><span className="font-semibold text-slate-800">2. Personal information</span> – Name, CNIC/B-Form, date of birth, gender, address, phone, and email.</li>
                <li><span className="font-semibold text-slate-800">3. Academic history</span> – Last school, last class passed, marks obtained, board, passing year, and group.</li>
                <li><span className="font-semibold text-slate-800">4. Interview details</span> – Interview date, interviewer name, outcome, and notes.</li>
                <li><span className="font-semibold text-slate-800">5. Guardian details</span> – Contact, relationship, employment, and organization/business information.</li>
                <li><span className="font-semibold text-slate-800">6. Attachments</span> – Passport photo, B-Form scan, and previous result/marksheet.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Admissions at a glance</h3>
              <div className="grid gap-4">
                <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Classes</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">Primary 1–5, Middle 6–8, Matric 9–10, Intermediate 11–12</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Course groups</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">Science, Computer Science, Pre-Medical, Pre-Engineering, Commerce, Arts, Diploma, Basics, Other</p>
                  <p className="mt-3 text-sm text-slate-600">Choose multiple course groups and receive a provisional fee recommendation before challan generation.</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Campuses</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">All active academy campuses, day and evening shifts, online or hybrid delivery.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Info Cards */}
        <section className="py-16 px-6 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                <BookOpen className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Academic Excellence</h3>
              <p className="text-gray-600 leading-relaxed">Our curriculum is designed to challenge and inspire students, preparing them for top universities worldwide.</p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Expert Faculty</h3>
              <p className="text-gray-600 leading-relaxed">Learn from dedicated professionals and subject matter experts passionate about student success.</p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
                <Trophy className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Holistic Growth</h3>
              <p className="text-gray-600 leading-relaxed">Extensive sports, arts, and leadership programs ensure our students develop well-rounded personalities.</p>
            </div>
          </div>
        </section>

        {/* Process */}
        <section className="bg-white border-y border-gray-200 py-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-10">Simple Admission Process</h2>
            
            <div className="grid sm:grid-cols-3 gap-6 relative">
              {/* Desktop connecting line */}
              <div className="hidden sm:block absolute top-6 left-[16.66%] right-[16.66%] h-0.5 bg-gray-100 -z-10" />
              
              <div className="bg-white">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-md">1</div>
                <h4 className="font-bold text-gray-900">Submit Application</h4>
                <p className="text-sm text-gray-500 mt-2">Fill the online form and upload required documents.</p>
              </div>
              <div className="bg-white">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-md">2</div>
                <h4 className="font-bold text-gray-900">Entrance Test</h4>
                <p className="text-sm text-gray-500 mt-2">Appear for an assessment tailored to the applied grade.</p>
              </div>
              <div className="bg-white">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-md">3</div>
                <h4 className="font-bold text-gray-900">Enrollment</h4>
                <p className="text-sm text-gray-500 mt-2">Complete fee payment and orientation processes.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-6 text-center text-sm">
        <p>© {new Date().getFullYear()} Evershine Academy. All rights reserved.</p>
      </footer>
    </div>
  )
}
