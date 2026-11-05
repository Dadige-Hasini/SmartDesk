-- ====================================================================
-- SmartDesk Production Seed Data
-- Version: 20261030_VALIDATED
-- Description: Canonical departments, support categories, routing rules,
--              SLA policies, and baseline published FAQs.
-- ====================================================================

-- 1. Departments
INSERT INTO public.departments (id, name, code, description, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Computer Science & Engineering', 'CSE', 'Academic department for Computing & Software Engineering', true),
  ('22222222-2222-2222-2222-222222222222', 'Electronics & Communication', 'ECE', 'Academic department for Electronics & Hardware Engineering', true),
  ('33333333-3333-3333-3333-333333333333', 'Hostel & Student Housing', 'HOSTEL', 'Campus residential facilities and dining administration', true),
  ('44444444-4444-4444-4444-444444444444', 'Finance & Accounts Office', 'FIN', 'Tuition, fee payments, dues, and scholarship disbursements', true),
  ('55555555-5555-5555-5555-555555555555', 'Central Library', 'LIB', 'Physical and electronic library resources and subscriptions', true),
  ('66666666-6666-6666-6666-666666666666', 'Examination & Evaluation Cell', 'EXAM', 'Hall tickets, grade sheets, re-evaluations, and transcripts', true),
  ('77777777-7777-7777-7777-777777777777', 'Student Affairs & Grievances', 'AFFAIRS', 'Student clubs, anti-ragging, mental well-being, and grievance redressal', true),
  ('88888888-8888-8888-8888-888888888888', 'Transport & Commute Services', 'TRANS', 'University bus routes, parking stickers, and day-scholar passes', true),
  ('99999999-9999-9999-9999-999999999999', 'Academic Registrar Office', 'REGISTRAR', 'Admissions, bonafide certificates, course drops, and degree verification', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Central IT Infrastructure', 'IT', 'Campus WiFi, Cyberoam, ERP accounts, and email administration', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- 2. Categories
INSERT INTO public.categories (id, name, code, description, is_active)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Academic & Grading', 'ACADEMICS', 'Course registration, attendance shortfall, grade revision, and faculty feedback', true),
  ('c1000000-0000-0000-0000-000000000002', 'Fee Payments & Dues', 'FINANCE_FEES', 'Tuition fee payments, installments, no-dues certificate, and refund inquiries', true),
  ('c1000000-0000-0000-0000-000000000003', 'Scholarships & Financial Aid', 'SCHOLARSHIPS', 'NSP, state government scholarships, merit-cum-means, and fee waivers', true),
  ('c1000000-0000-0000-0000-000000000004', 'Hostel & Mess Facilities', 'HOSTEL_MESS', 'Room allocation, maintenance, mess rebate, night leave, and roommate requests', true),
  ('c1000000-0000-0000-0000-000000000005', 'Examinations & Hall Tickets', 'EXAMINATIONS', 'Exam schedule, admit cards, backlog registration, and transcript requests', true),
  ('c1000000-0000-0000-0000-000000000006', 'Campus WiFi & IT Accounts', 'CAMPUS_IT', 'WiFi MAC address binding, student portal reset, institutional email, and VPN', true),
  ('c1000000-0000-0000-0000-000000000007', 'Library & Digital Resources', 'LIBRARY_SERVICES', 'Book renewals, overdue fines, IEEE/ACM remote proxy, and study carrel booking', true),
  ('c1000000-0000-0000-0000-000000000008', 'Transportation & Bus Passes', 'TRANSPORTATION', 'Bus pass renewal, route modifications, and campus vehicle parking permits', true),
  ('c1000000-0000-0000-0000-000000000009', 'Placements & Internships', 'CAREER_PLACEMENT', 'Company drive eligibility, internship NOC, resume verification, and interview scheduling', true),
  ('c1000000-0000-0000-0000-000000000010', 'Student Affairs & Grievances', 'STUDENT_AFFAIRS', 'ID card replacement, medical leaves, anti-ragging complaints, and counseling', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- 3. Category Routing Rules (Automatic Department Mapping)
INSERT INTO public.category_routing_rules (category_id, default_department_id, default_priority, is_active)
VALUES
  ('c1000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'Medium', true),
  ('c1000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'High', true),
  ('c1000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 'Medium', true),
  ('c1000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'Medium', true),
  ('c1000000-0000-0000-0000-000000000005', '66666666-6666-6666-6666-666666666666', 'High', true),
  ('c1000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Medium', true),
  ('c1000000-0000-0000-0000-000000000007', '55555555-5555-5555-5555-555555555555', 'Low', true),
  ('c1000000-0000-0000-0000-000000000008', '88888888-8888-8888-8888-888888888888', 'Low', true),
  ('c1000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Medium', true),
  ('c1000000-0000-0000-0000-000000000010', '77777777-7777-7777-7777-777777777777', 'Urgent', true)
ON CONFLICT (category_id, default_department_id) DO NOTHING;

-- 4. SLA Policies
INSERT INTO public.sla_policies (id, name, priority, response_time_hours, resolution_time_hours, is_active)
VALUES
  ('e1000000-0000-0000-0000-000000000001', 'Urgent Emergency Response SLA', 'Urgent', 1, 6, true),
  ('e1000000-0000-0000-0000-000000000002', 'High Priority Operation SLA', 'High', 4, 24, true),
  ('e1000000-0000-0000-0000-000000000003', 'Standard Academic Support SLA', 'Medium', 8, 48, true),
  ('e1000000-0000-0000-0000-000000000004', 'Low Priority Inquiry SLA', 'Low', 24, 72, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  priority = EXCLUDED.priority,
  response_time_hours = EXCLUDED.response_time_hours,
  resolution_time_hours = EXCLUDED.resolution_time_hours,
  is_active = EXCLUDED.is_active;

-- 5. Canonical Published FAQs
INSERT INTO public.faqs (
  id, faq_code, question, answer, category_id, department_id, keywords,
  view_count, helpful_count, unhelpful_count, status, visibility, version, is_published
)
VALUES
  (
    'f1000000-0000-0000-0000-000000000001',
    'FAQ-001',
    'What is the minimum attendance required to appear for semester end examinations?',
    'Under university academic regulations, students must maintain at least 75% aggregate attendance in each registered theory and laboratory course. A condonation of up to 10% may be granted by the Academic Dean solely on medical grounds with verified documentation.',
    'c1000000-0000-0000-0000-000000000001',
    '99999999-9999-9999-9999-999999999999',
    ARRAY['attendance', 'medical certificate', 'shortage', '75 percent', 'condonation'],
    145, 48, 2, 'PUBLISHED', 'PUBLIC', 1, true
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'FAQ-002',
    'How do I apply for course grade re-evaluation or answer script photocopy?',
    'Submit the online Re-evaluation Application on the Examination Portal within 10 days of results declaration. Fee is INR 500 per theory paper for re-evaluation and INR 300 for digital copy.',
    'c1000000-0000-0000-0000-000000000005',
    '66666666-6666-6666-6666-666666666666',
    ARRAY['re-evaluation', 'photocopy', 'marks recount', 'exam result', 'paper checking'],
    89, 32, 1, 'PUBLISHED', 'PUBLIC', 1, true
  ),
  (
    'f1000000-0000-0000-0000-000000000003',
    'FAQ-003',
    'What are the payment deadlines and late fine slabs for semester tuition fees?',
    'Tuition fee must be cleared by the 10th of the semester start month. A late fee of INR 100/day applies for the first 14 days, increasing to INR 250/day up to day 30.',
    'c1000000-0000-0000-0000-000000000002',
    '44444444-4444-4444-4444-444444444444',
    ARRAY['tuition fee', 'late fine', 'fee schedule', 'accounts due', 'installments'],
    210, 65, 3, 'PUBLISHED', 'PUBLIC', 1, true
  ),
  (
    'f1000000-0000-0000-0000-000000000004',
    'FAQ-004',
    'How do I register a new laptop MAC address for campus WiFi?',
    'Connect to "Campus-Onboarding" network and visit http://wifi.college.edu to enter your student credentials and device MAC address. Maximum 3 devices permitted per student.',
    'c1000000-0000-0000-0000-000000000006',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ARRAY['wifi', 'mac address', 'cyberoam', 'wireless', 'device registration'],
    340, 112, 4, 'PUBLISHED', 'PUBLIC', 1, true
  ),
  (
    'f1000000-0000-0000-0000-000000000005',
    'FAQ-005',
    'What is the procedure to get an Internship No Objection Certificate (NOC)?',
    'Submit company offer letter, duration details, and job role to the Department Placement Faculty Coordinator. Approved NOC is issued within 3 working days.',
    'c1000000-0000-0000-0000-000000000009',
    '11111111-1111-1111-1111-111111111111',
    ARRAY['internship noc', 'no objection certificate', 'company offer', 'internship approval'],
    167, 54, 1, 'PUBLISHED', 'PUBLIC', 1, true
  ),
  (
    'f1000000-0000-0000-0000-000000000006',
    'FAQ-006',
    'How can students report ragging, harassment, or severe personal grievances?',
    'Contact the 24/7 Anti-Ragging Helpline at 1800-180-5522 or email antiragging@college.edu. Complaints can also be submitted confidentially on SmartDesk.',
    'c1000000-0000-0000-0000-000000000010',
    '77777777-7777-7777-7777-777777777777',
    ARRAY['anti ragging', 'harassment', 'complaint', 'student grievance', 'counselor'],
    95, 39, 0, 'PUBLISHED', 'PUBLIC', 1, true
  )
ON CONFLICT (id) DO UPDATE SET
  faq_code = EXCLUDED.faq_code,
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  status = EXCLUDED.status,
  visibility = EXCLUDED.visibility,
  is_published = EXCLUDED.is_published;
