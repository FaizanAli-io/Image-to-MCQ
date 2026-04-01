import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const { excelBuffer, filename, stats, sourcePdfName } = await req.json();
    
    if (!excelBuffer) {
      return NextResponse.json(
        { error: 'Excel buffer is required' },
        { status: 400 }
      );
    }
    
    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TARGET) {
      return NextResponse.json(
        { error: 'Email configuration missing. Please set EMAIL_USER, EMAIL_PASS, and EMAIL_TARGET in .env.local' },
        { status: 500 }
      );
    }
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    
    // Convert base64 buffer back to Buffer
    const buffer = Buffer.from(excelBuffer, 'base64');

    const sourcePdfLine = sourcePdfName
      ? `Source PDF: ${sourcePdfName}`
      : 'Source PDF: Not provided';
    
    // Build email body with stats
    const emailBody = `
Hello,

The AI Mapper has completed processing your questions.

Mapping Statistics:
- ${sourcePdfLine}
- Total Questions: ${stats.total}
- Clean Mappings: ${stats.cleanMappings}
- Data Manipulation Questions: ${stats.dataManipulation}
- Dual Topic Questions: ${stats.dualTopics}
- Questions Needing Review: ${stats.needsReview}

Please find the complete mapping results in the attached Excel file.

Best regards,
AI Mapper
    `.trim();
    
    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TARGET,
      subject: sourcePdfName
        ? `AI Mapper - ${sourcePdfName}`
        : 'AI Mapper - Question Mapping Results',
      text: emailBody,
      attachments: [
        {
          filename: filename || 'mapped_questions.xlsx',
          content: buffer,
        },
      ],
    });
    
    return NextResponse.json({
      success: true,
      message: `Email sent successfully to ${process.env.EMAIL_TARGET}`
    });
    
  } catch (error: any) {
    console.error('Email sending error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to send email',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
