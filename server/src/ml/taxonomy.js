/**
 * SmartDesk Canonical 10 Ticket Categories and Intent Taxonomy
 * 
 * Formal definitions of the 10 university support categories,
 * assigned resolving departments, and supported query intents.
 */

export const CATEGORIES = [
  {
    index: 0,
    id: 'c1000000-0000-0000-0000-000000000001',
    code: 'ACADEMIC_RECORDS',
    name: 'Academic Records & Transcripts',
    defaultDepartmentCode: 'ACAD',
    description: 'Official transcripts, degree certificates, grade cards, credit transfer, and course registration.',
    keywords: ['transcript', 'degree', 'certificate', 'grade', 'credits', 'gpa', 'cgpa', 'migration', 'bonafide', 'curriculum', 'syllabus'],
    supportedIntents: [
      'request_transcript',
      'degree_certificate_inquiry',
      'credit_transfer_status',
      'course_registration_issue',
      'grade_card_correction',
    ],
  },
  {
    index: 1,
    id: 'c1000000-0000-0000-0000-000000000002',
    code: 'TUITION_FEES',
    name: 'Tuition Fees & Payments',
    defaultDepartmentCode: 'FIN',
    description: 'Semester tuition fees, online payment gateways, fee receipts, installment requests, and duplicate charges.',
    keywords: ['fee', 'tuition', 'payment', 'receipt', 'due', 'installment', 'upi', 'challan', 'transaction', 'surcharge', 'refund'],
    supportedIntents: [
      'fee_payment_deadline',
      'receipt_generation_failure',
      'duplicate_fee_deduction',
      'installment_plan_request',
      'late_fee_waiver',
    ],
  },
  {
    index: 2,
    id: 'c1000000-0000-0000-0000-000000000003',
    code: 'SCHOLARSHIPS',
    name: 'Scholarships & Financial Aid',
    defaultDepartmentCode: 'FIN',
    description: 'Merit scholarships, need-based financial aid, government grant verification, and institutional fee waivers.',
    keywords: ['scholarship', 'financial aid', 'stipend', 'grant', 'fellowship', 'merit', 'concession', 'nsp', 'freeship', 'disbursement'],
    supportedIntents: [
      'scholarship_eligibility',
      'application_verification_status',
      'disbursement_delay',
      'income_certificate_submission',
      'renewal_criteria',
    ],
  },
  {
    index: 3,
    id: 'c1000000-0000-0000-0000-000000000004',
    code: 'EXAM_CELL',
    name: 'Examinations & Hall Tickets',
    defaultDepartmentCode: 'COE',
    description: 'Exam timetables, hall ticket download, revaluation, backlog registration, and exam scheduling clashes.',
    keywords: ['exam', 'examination', 'hall ticket', 'admit card', 'revaluation', 'rechecking', 'backlog', 'supplementary', 'invigilation', 'seating'],
    supportedIntents: [
      'hall_ticket_download_error',
      'timetable_clash_reporting',
      'paper_revaluation_request',
      'backlog_exam_registration',
      'exam_absence_medical_leave',
    ],
  },
  {
    index: 4,
    id: 'c1000000-0000-0000-0000-000000000005',
    code: 'HOSTEL_HOUSING',
    name: 'Hostel & Accommodation',
    defaultDepartmentCode: 'ADM',
    description: 'Hostel room allotment, mess food catering, curfew permissions, room maintenance, and room change requests.',
    keywords: ['hostel', 'room', 'allotment', 'mess', 'food', 'warden', 'curfew', 'plumbing', 'electrical', 'furniture', 'resident'],
    supportedIntents: [
      'hostel_room_allotment',
      'mess_food_complaint',
      'room_maintenance_repair',
      'curfew_leave_permission',
      'hostel_fee_refund',
    ],
  },
  {
    index: 5,
    id: 'c1000000-0000-0000-0000-000000000006',
    code: 'CAMPUS_IT',
    name: 'IT Services & WiFi Access',
    defaultDepartmentCode: 'IT',
    description: 'Student portal credentials, WiFi connectivity, ERP errors, institutional email reset, and computer lab software.',
    keywords: ['wifi', 'network', 'password', 'portal', 'erp', 'email', 'login', 'account', 'software', 'lab', 'server'],
    supportedIntents: [
      'portal_login_failure',
      'wifi_mac_registration',
      'password_reset_request',
      'email_quota_exceeded',
      'vpn_access_inquiry',
    ],
  },
  {
    index: 6,
    id: 'c1000000-0000-0000-0000-000000000007',
    code: 'LIBRARY_SERVICES',
    name: 'Library & Digital Resources',
    defaultDepartmentCode: 'LIB',
    description: 'Book borrowing, overdue fine clearance, IEEE/ACM digital access, lost library card, and book reservation.',
    keywords: ['library', 'book', 'borrow', 'return', 'fine', 'journal', 'ieee', 'springer', 'catalog', 'opac', 'reading room'],
    supportedIntents: [
      'book_renewal_extension',
      'digital_database_access',
      'overdue_fine_inquiry',
      'book_reservation',
      'lost_book_replacement',
    ],
  },
  {
    index: 7,
    id: 'c1000000-0000-0000-0000-000000000008',
    code: 'TRANSPORTATION',
    name: 'Campus Transport & Bus Passes',
    defaultDepartmentCode: 'ADM',
    description: 'Bus route schedules, semester transport pass renewal, campus parking stickers, and shuttle timings.',
    keywords: ['bus', 'transport', 'pass', 'route', 'shuttle', 'parking', 'vehicle', 'commute', 'driver', 'pickup'],
    supportedIntents: [
      'bus_pass_issuance',
      'route_schedule_inquiry',
      'parking_permit_sticker',
      'transport_fee_payment',
      'bus_breakdown_notification',
    ],
  },
  {
    index: 8,
    id: 'c1000000-0000-0000-0000-000000000009',
    code: 'CAREER_PLACEMENT',
    name: 'Placement & Career Services',
    defaultDepartmentCode: 'ACAD',
    description: 'Internship approval NOC, on-campus recruitment drives, resume verification, interview scheduling, and job offers.',
    keywords: ['placement', 'internship', 'noc', 'resume', 'cv', 'interview', 'recruiter', 'company', 'package', 'offer', 'training'],
    supportedIntents: [
      'internship_noc_request',
      'placement_drive_registration',
      'resume_verification',
      'interview_conflict_reschedule',
      'offer_letter_submission',
    ],
  },
  {
    index: 9,
    id: 'c1000000-0000-0000-0000-000000000010',
    code: 'STUDENT_AFFAIRS',
    name: 'Student Affairs & Disciplinary',
    defaultDepartmentCode: 'ADM',
    description: 'Student ID replacement, student club activities, anti-ragging cell, student grievances, and bonafide attestations.',
    keywords: ['id card', 'lost id', 'club', 'event', 'ragging', 'grievance', 'harassment', 'discipline', 'bonafide', 'affairs'],
    supportedIntents: [
      'id_card_replacement',
      'bonafide_letter_request',
      'club_event_approval',
      'student_grievance_filing',
      'anti_ragging_complaint',
    ],
  },
];

export const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

export function getCategoryByCode(code) {
  return CATEGORIES.find((c) => c.code === code) || null;
}

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function getCategoryByIndex(index) {
  return CATEGORIES[index] || null;
}
