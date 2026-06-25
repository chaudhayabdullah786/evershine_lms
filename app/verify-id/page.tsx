'use client';

import { ChangeEvent, useState } from 'react';
import Link from 'next/link';
import { QrCode, Camera, AlertCircle, CheckCircle2, User, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { AcademyLogo } from '@/components/AcademyLogo';
import { notify } from '@/lib/notify';

export default function VerifyIDPage() {
  const [scannedData, setScannedData] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setHasError(true);
      notify.error('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // In a real app, this would decode the uploaded QR image.
      setTimeout(() => {
        setScannedData({
          id: 'ES-2024-001234',
          name: 'Muhammad Ahmed Khan',
          rollNumber: '5B-2024',
          class: 'Class 5-B',
          campus: 'Boys Campus',
          dateOfBirth: '2015-03-15',
          fatherName: 'Khan Muhammad',
          status: 'ACTIVE',
          admissionDate: '2022-04-01',
        });
        setIsScanning(false);
        setHasError(false);
        notify.success('ID Verified', {
          description: 'Student information retrieved successfully',
        });
      }, 1500);
    };
    reader.readAsArrayBuffer(file);
  };

  const mockScan = () => {
    setIsScanning(true);
    setHasError(false);
    
    // Simulate scanning with animation
    setTimeout(() => {
      setScannedData({
        id: 'ES-2024-001234',
        name: 'Muhammad Ahmed Khan',
        rollNumber: '5B-2024',
        class: 'Class 5-B',
        campus: 'Boys Campus',
        dateOfBirth: '2015-03-15',
        fatherName: 'Khan Muhammad',
        status: 'ACTIVE',
        admissionDate: '2022-04-01',
      });
      setIsScanning(false);
      notify.success('ID Verified', {
        description: 'Student information retrieved successfully',
      });
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 p-4 animate-fadeIn">
      <div className="max-w-2xl mx-auto py-8">
        {/* Header */}
        <div className="text-center mb-12 animate-slideInTop">
          <AcademyLogo variant="primary" className="w-24 h-24 mx-auto drop-shadow-lg mb-4 hover:scale-110 transition-transform" />
          <h1 className="text-4xl font-black text-slate-900 mb-2">EverShine Academy</h1>
          <p className="text-lg text-slate-600">Student ID Verification Portal</p>
          <p className="text-sm text-slate-500 mt-2">Scan or upload a student QR code to verify identity</p>
        </div>

        {/* Scanner Card */}
        <Card className="border-2 border-blue-200 shadow-xl mb-6 animate-slideInUp">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-teal-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-600" />
              Scan Student QR Code
            </CardTitle>
            <CardDescription>
              Use a QR code reader or upload an image to verify a student
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-8">
            {!scannedData ? (
              <div className="space-y-6">
                {/* Scanner Preview */}
                <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 flex items-center justify-center min-h-96 overflow-hidden group">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-teal-500 animate-pulse"></div>
                  </div>

                  <div className="relative z-10 text-center space-y-4">
                    <div className="flex justify-center mb-4">
                      <div className="relative w-32 h-32 bg-slate-700 rounded-lg border-4 border-blue-500 flex items-center justify-center group-hover:border-teal-500 transition-colors">
                        {isScanning ? (
                          <svg
                            className="w-16 h-16 text-blue-400 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <QrCode className="w-16 h-16 text-blue-400" />
                        )}
                      </div>
                    </div>

                    <div className="text-white">
                      <p className="text-lg font-semibold">
                        {isScanning ? 'Scanning...' : 'Ready to Scan'}
                      </p>
                      <p className="text-sm text-slate-300">
                        {isScanning ? 'Position QR code in frame' : 'Point camera at QR code'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Button
                    onClick={mockScan}
                    disabled={isScanning}
                    className="py-6 text-base font-semibold bg-blue-600 hover:bg-blue-700 transition-all"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    {isScanning ? 'Scanning...' : 'Start Camera Scan'}
                  </Button>

                  <label className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full py-6 text-base font-semibold cursor-pointer hover:bg-slate-100 transition-colors"
                      asChild
                    >
                      <span>
                        <QrCode className="mr-2 h-5 w-5" />
                        Upload QR Image
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      aria-label="Upload QR code image"
                    />
                  </label>
                </div>

                {hasError && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-4 flex items-start gap-3 animate-slideInTop">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-red-900">Scan Failed</p>
                      <p className="text-sm text-red-700">Please try again or contact support</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Verification Result
              <div className="space-y-6 animate-slideInUp">
                {/* Success Message */}
                <div className="rounded-lg border border-green-300 bg-green-50 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-900">Verification Successful</p>
                    <p className="text-sm text-green-700">Student information verified</p>
                  </div>
                </div>

                {/* Student Information */}
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Photo & Basic Info */}
                    <div className="flex flex-col items-center text-center">
                      <div className="w-24 h-24 bg-gradient-to-br from-blue-200 to-teal-200 rounded-full mb-4 flex items-center justify-center border-4 border-blue-400">
                        <User className="w-12 h-12 text-slate-600" />
                      </div>
                      <h2 className="text-2xl font-black text-slate-900">{scannedData.name}</h2>
                      <p className="text-sm text-slate-500 mt-1">ID: {scannedData.id}</p>
                    </div>

                    {/* Details */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Roll Number</p>
                        <p className="text-lg font-bold text-slate-900">{scannedData.rollNumber}</p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Class</p>
                        <p className="text-lg font-bold text-slate-900">{scannedData.class}</p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Campus</p>
                        <p className="text-lg font-bold text-slate-900">{scannedData.campus}</p>
                      </div>

                      <div className="flex items-center gap-2 mt-4">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold">
                          <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                          {scannedData.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 mt-6 pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Date of Birth</p>
                      <p className="text-base font-semibold text-slate-900 flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(scannedData.dateOfBirth).toLocaleDateString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Father's Name</p>
                      <p className="text-base font-semibold text-slate-900 flex items-center gap-2 mt-1">
                        <User className="w-4 h-4" />
                        {scannedData.fatherName}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Admission Date</p>
                      <p className="text-base font-semibold text-slate-900 flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(scannedData.admissionDate).toLocaleDateString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Current Status</p>
                      <p className="text-base font-semibold text-slate-900 flex items-center gap-2 mt-1">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        Active Enrollment
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => setScannedData(null)}
                    variant="outline"
                    className="flex-1 py-3 font-semibold"
                  >
                    Scan Another ID
                  </Button>

                  <Link href="/" className="flex-1">
                    <Button className="w-full py-3 font-semibold bg-green-600 hover:bg-green-700">
                      Return to Dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <p>This portal is secure and protected. All information is confidential.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
              <Link href="/" className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                ← Back Home
              </Link>
              <span className="hidden sm:inline">•</span>
              <a href="mailto:support@evershineacademy.edu.pk" className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                Need Help?
              </a>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
