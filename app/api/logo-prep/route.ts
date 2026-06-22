import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import path from 'path'

export async function GET() {
  try {
    const cwd = process.cwd()
    const scriptPath = path.join(cwd, 'designs', 'crop_logo.py')
    
    // Execute python script
    const stdout = execSync(`python3 "${scriptPath}"`, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
    
    return NextResponse.json({
      success: true,
      message: 'Logo prep script executed successfully',
      stdout
    })
  } catch (error: any) {
    console.error('Error executing logo prep script:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stderr: error.stderr?.toString() || ''
    }, { status: 500 })
  }
}
