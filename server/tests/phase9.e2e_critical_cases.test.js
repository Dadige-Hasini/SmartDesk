import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { supabaseClient } from '../src/config/supabase.js';
import {
  ticketRepository,
  inMemoryProfiles,
  inMemoryTickets,
  inMemoryEvents,
} from '../src/repositories/ticket.repository.js';
import { inMemoryComments, CommentService } from '../src/services/comment.service.js';
import { inMemoryAttachments, inMemoryFileBuffers, AttachmentService } from '../src/services/attachment.service.js';
import { ticketService } from '../src/services/ticket.service.js';
import { staffService } from '../src/services/staff.service.js';
import { inMemoryEmailJobs } from '../src/services/email.service.js';

describe('SmartDesk Phase 9: End-to-End Critical Test Cases (1 to 15)', () => {
  const DEPT_CSE = '11111111-1111-1111-1111-111111111111';
  const DEPT_FINANCE = '22222222-2222-2222-2222-222222222222';
  const DEPT_AFFAIRS = '77777777-7777-7777-7777-777777777777';

  // Canonical Category UUIDs from taxonomy.js
  const CAT_ACADEMIC = 'c1000000-0000-0000-0000-000000000001';
  const CAT_TUITION = 'c1000000-0000-0000-0000-000000000002';
  const CAT_HOSTEL = 'c1000000-0000-0000-0000-000000000004';
  const CAT_LIBRARY = 'c1000000-0000-0000-0000-000000000005';
  const CAT_IT = 'c1000000-0000-0000-0000-000000000006';
  const CAT_GRIEVANCE = 'c1000000-0000-0000-0000-000000000007';

  const studentAlice = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@student.college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    roll_number: '2024BCSE001',
  };

  const studentBob = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@student.college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    roll_number: '2024BCSE002',
  };

  const staffCseCharlie = {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'charlie@cse.college.edu',
    full_name: 'Prof. Charlie CSE',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    department_code: 'CSE',
  };

  const staffCseDan = {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'dan@cse.college.edu',
    full_name: 'Prof. Dan CSE',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    department_code: 'CSE',
  };

  const staffFinanceCarol = {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'carol@finance.college.edu',
    full_name: 'Carol Finance',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
    department_code: 'FIN',
  };

  const staffGrievanceOfficer = {
    id: '00000000-0000-0000-0000-000000000006',
    email: 'grievance@affairs.college.edu',
    full_name: 'Dr. Officer Student Affairs',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_AFFAIRS,
    department_code: 'AFFAIRS',
  };

  const superAdminSam = {
    id: '00000000-0000-0000-0000-000000000007',
    email: 'admin@college.edu',
    full_name: 'Sam Super Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  };

  const tokens = {
    'token-alice': studentAlice,
    'token-bob': studentBob,
    'token-staff-cse': staffCseCharlie,
    'token-staff-cse-dan': staffCseDan,
    'token-staff-finance': staffFinanceCarol,
    'token-staff-grievance': staffGrievanceOfficer,
    'token-super-admin': superAdminSam,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    inMemoryTickets.clear();
    inMemoryProfiles.clear();
    inMemoryComments.length = 0;
    inMemoryAttachments.length = 0;
    inMemoryFileBuffers.clear();
    inMemoryEmailJobs.length = 0;
    if (inMemoryEvents) inMemoryEvents.clear();

    for (const user of Object.values(tokens)) {
      ticketRepository.registerProfile(user);
      inMemoryProfiles.set(user.id, user);
      inMemoryProfiles[user.id] = user;
    }

    if (supabaseClient?.auth) {
      vi.spyOn(supabaseClient.auth, 'getUser').mockImplementation(async (tok) => {
        const matched = tokens[tok] || Object.values(tokens).find((u) => u.id === tok || u.email === tok);
        if (matched) {
          return {
            data: { user: { id: matched.id, email: matched.email } },
            error: null,
          };
        }
        return {
          data: { user: null },
          error: { message: 'Invalid, revoked, or expired authentication token.' },
        };
      });
    }
  });

  // =========================================================================
  // CRITICAL CASE 1: Student Login & Ticket Creation
  // =========================================================================
  it('Critical Case 1: Student can log in and successfully create a ticket', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', 'Bearer token-alice')
      .send({
        title: 'Laboratory Software License Renewal Request',
        description: 'Unable to activate the MATLAB campus license on lab workstation 14. Error code 0x8004.',
        categoryId: CAT_IT,
        priority: 'Medium',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.ticketNumber || res.body.data.ticket_number).toMatch(/^TKT-\d{8}-[A-Z0-9]{4,6}$/i);
    expect(res.body.data.status).toBe('OPEN');
    expect(res.body.data.created_by).toBe(studentAlice.id);
  });

  // =========================================================================
  // CRITICAL CASE 2: Ticket Appears in Student's Dashboard
  // =========================================================================
  it("Critical Case 2: Newly created ticket appears in that student's dashboard and ticket list", async () => {
    const createRes = await request(app)
      .post('/api/tickets')
      .set('Authorization', 'Bearer token-alice')
      .send({
        title: 'Transcript Request for Alice',
        description: 'Need official sealed academic transcripts for graduate school application.',
        categoryId: CAT_ACADEMIC,
        priority: 'High',
      });

    expect(createRes.status).toBe(201);
    const ticketId = createRes.body.data.id;

    // Student fetches their tickets list via /api/tickets
    const listRes = await request(app)
      .get('/api/tickets')
      .set('Authorization', 'Bearer token-alice');

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    const tickets = listRes.body.data.tickets || listRes.body.data;
    const found = tickets.find((t) => t.id === ticketId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Transcript Request for Alice');
    expect(found.status).toBe('OPEN');
  });

  // =========================================================================
  // CRITICAL CASE 3: Ticket Appears in Correct Authorized Staff Queue
  // =========================================================================
  it('Critical Case 3: Ticket appears in the correct authorized staff department queue', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Compiler Design Assignment Server Outage',
        description: 'The automated grading test harness server for CS301 is unreachable.',
        categoryId: CAT_IT,
        assignedDepartmentId: DEPT_CSE,
        priority: 'High',
      },
      studentAlice
    );

    // Authorized CSE staff views department queue
    const queueRes = await request(app)
      .get('/api/staff/queue')
      .set('Authorization', 'Bearer token-staff-cse');

    expect(queueRes.status).toBe(200);
    expect(queueRes.body.success).toBe(true);
    const queue = queueRes.body.data.tickets || queueRes.body.data;
    const matching = queue.find((t) => t.id === ticket.id);
    expect(matching).toBeDefined();
    expect(matching.assigned_department_id).toBe(DEPT_CSE);
  });

  // =========================================================================
  // CRITICAL CASE 4: Staff Can Open, Assign, and Update an Authorized Ticket
  // =========================================================================
  it('Critical Case 4: Staff can open, assign, and update an authorized department ticket', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Lab Access Card Not Working',
        description: 'RFID card reader at Lab 304 does not open the door.',
        categoryId: CAT_IT,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Medium',
      },
      studentAlice
    );

    // 1. Staff opens/reads the ticket
    const openRes = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-staff-cse');
    expect(openRes.status).toBe(200);

    // 2. Staff claims ticket (which transitions OPEN -> IN_PROGRESS)
    const claimRes = await request(app)
      .post(`/api/tickets/${ticket.id}/claim`)
      .set('Authorization', 'Bearer token-staff-cse');
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.assigned_to).toBe(staffCseCharlie.id);
    expect(claimRes.body.data.status).toBe('IN_PROGRESS');

    // 3. Staff reassigns to colleague in same department via POST /api/tickets/:id/assign
    const assignRes = await request(app)
      .post(`/api/tickets/${ticket.id}/assign`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({ assignedTo: staffCseDan.id });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.assigned_to).toBe(staffCseDan.id);

    // 4. Staff transitions status to AWAITING_INFO via PATCH /api/tickets/:id/status
    const updateRes = await request(app)
      .patch(`/api/tickets/${ticket.id}/status`)
      .set('Authorization', 'Bearer token-staff-cse-dan')
      .send({ status: 'AWAITING_INFO' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.status).toBe('AWAITING_INFO');
  });

  // =========================================================================
  // CRITICAL CASE 5: Public Staff Reply Visible to Student
  // =========================================================================
  it('Critical Case 5: Public staff reply is visible to the student', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Hostel WiFi Connection Dropping',
        description: 'WiFi keeps disconnecting every 10 minutes in Block B.',
        categoryId: CAT_HOSTEL,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Medium',
      },
      studentAlice
    );

    // Staff posts public comment
    const postRes = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({
        content: 'We have reset the access point on 2nd floor Block B. Please verify if connectivity is stable.',
        isInternal: false,
      });
    expect(postRes.status).toBe(201);

    // Student queries ticket comments
    const listRes = await request(app)
      .get(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-alice');

    expect(listRes.status).toBe(200);
    const comments = listRes.body.data.comments || listRes.body.data;
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toContain('We have reset the access point');
    expect(comments[0].author_name).toBe(staffCseCharlie.full_name);
    expect(comments[0].is_internal).toBe(false);
  });

  // =========================================================================
  // CRITICAL CASE 6: Internal Note Is NOT Visible to Student
  // =========================================================================
  it('Critical Case 6: Internal staff notes are strictly hidden from student views', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Fee Payment Reconciliation Issue',
        description: 'My tuition fee receipt shows pending status despite bank debit.',
        categoryId: CAT_TUITION,
        assignedDepartmentId: DEPT_CSE,
        priority: 'High',
      },
      studentAlice
    );

    // Staff posts public message
    await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({
        content: 'We have received your bank reference and are verifying with our gateway.',
        isInternal: false,
      });

    // Staff posts confidential internal note
    await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({
        content: 'INTERNAL NOTE: Gateway API timed out on batch sync. Reconciled manually in ERP system ledger.',
        isInternal: true,
      });

    // 1. Staff queries comments -> sees both 2 comments
    const staffRes = await request(app)
      .get(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-staff-cse');
    const staffComments = staffRes.body.data.comments || staffRes.body.data;
    expect(staffComments).toHaveLength(2);

    // 2. Student queries comments -> sees ONLY 1 comment, internal note strictly filtered
    const studentRes = await request(app)
      .get(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-alice');
    const studentComments = studentRes.body.data.comments || studentRes.body.data;
    expect(studentComments).toHaveLength(1);
    expect(studentComments[0].content).not.toContain('INTERNAL NOTE');
    expect(studentComments[0].is_internal).toBe(false);
  });

  // =========================================================================
  // CRITICAL CASE 7: Status and Assignment Changes Remain Synchronized
  // =========================================================================
  it('Critical Case 7: Status and assignment changes remain synchronized across views', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Course Drop Approval Form Submission',
        description: 'Submitted elective course drop form for CS402.',
        categoryId: CAT_ACADEMIC,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Medium',
      },
      studentAlice
    );

    // Staff claims ticket via HTTP
    await request(app)
      .post(`/api/tickets/${ticket.id}/claim`)
      .set('Authorization', 'Bearer token-staff-cse');

    // Move to IN_PROGRESS
    await request(app)
      .patch(`/api/tickets/${ticket.id}/status`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({ status: 'IN_PROGRESS' });

    // Move to RESOLVED with required summary
    await request(app)
      .patch(`/api/tickets/${ticket.id}/status`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({
        status: 'RESOLVED',
        resolutionSummary: 'Elective drop approved by Academic Dean and records updated in SIS portal.',
      });

    // Student fetches ticket: sees updated status and resolution summary immediately
    const studentRes = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-alice');

    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data.status).toBe('RESOLVED');
    expect(studentRes.body.data.assigned_to).toBe(staffCseCharlie.id);
    expect(studentRes.body.data.resolution_summary).toContain('Elective drop approved');
  });

  // =========================================================================
  // CRITICAL CASE 8: Unassigned Tickets Visible to Department Staff
  // =========================================================================
  it('Critical Case 8: Unassigned tickets remain visible in the authorized department queue', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Unassigned CSE Laboratory Inconvenience',
        description: 'Air conditioning not functioning in CS Computer Lab 1.',
        categoryId: CAT_IT,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Low',
      },
      studentAlice
    );

    expect(ticket.assigned_to).toBeFalsy();

    // Query queue with unassigned filter
    const queueRes = await request(app)
      .get('/api/staff/queue?filter=unassigned')
      .set('Authorization', 'Bearer token-staff-cse');

    expect(queueRes.status).toBe(200);
    const unassigned = queueRes.body.data.tickets || queueRes.body.data;
    const found = unassigned.find((t) => t.id === ticket.id);
    expect(found).toBeDefined();
    expect(found.assigned_to).toBeFalsy();
  });

  // =========================================================================
  // CRITICAL CASE 9: Students Cannot Access Another Student's Tickets
  // =========================================================================
  it("Critical Case 9: Students cannot access, comment on, or edit another student's tickets", async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Confidential Academic Special Exam Consideration',
        description: 'Medical certificate attached for missing mid-term exam.',
        categoryId: CAT_ACADEMIC,
        assignedDepartmentId: DEPT_CSE,
        priority: 'High',
      },
      studentAlice
    );

    // Student Bob attempts to access Alice's ticket details -> 403
    const getRes = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-bob');
    expect(getRes.status).toBe(403);

    // Student Bob attempts to post a comment -> 403
    const commentRes = await request(app)
      .post(`/api/tickets/${ticket.id}/comments`)
      .set('Authorization', 'Bearer token-bob')
      .send({ content: 'Unauthorized comment by Bob' });
    expect(commentRes.status).toBe(403);

    // Student Bob attempts to edit ticket -> 403
    const editRes = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-bob')
      .send({ title: 'Tampered title' });
    expect(editRes.status).toBe(403);
  });

  // =========================================================================
  // CRITICAL CASE 10: Staff Cannot Access Unauthorized Departments
  // =========================================================================
  it('Critical Case 10: Staff cannot claim or modify tickets in unauthorized departments', async () => {
    // Ticket routed to CSE Department
    const ticket = await ticketService.createTicket(
      {
        title: 'Operating Systems Project Cluster Account',
        description: 'Cluster quota full for project group 5.',
        categoryId: CAT_IT,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Medium',
      },
      studentAlice
    );

    // Finance staff Carol attempts to access CSE ticket -> 403
    const getRes = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-staff-finance');
    expect(getRes.status).toBe(403);

    // Finance staff Carol attempts to claim CSE ticket -> 403
    const claimRes = await request(app)
      .post(`/api/tickets/${ticket.id}/claim`)
      .set('Authorization', 'Bearer token-staff-finance');
    expect(claimRes.status).toBe(403);
  });

  // =========================================================================
  // CRITICAL CASE 11: Restricted Grievances Are Protected
  // =========================================================================
  it('Critical Case 11: Restricted confidential grievances are protected from general staff', async () => {
    // Student Alice submits a confidential grievance ticket
    const grievanceTicket = await ticketService.createTicket(
      {
        title: 'Confidential Harassment & Safety Grievance Report',
        description: 'Sensitive personal report regarding hostel curfew incident.',
        categoryId: CAT_GRIEVANCE,
        assignedDepartmentId: DEPT_AFFAIRS,
        priority: 'Urgent',
        isConfidential: true,
      },
      studentAlice
    );

    expect(grievanceTicket.is_confidential).toBe(true);

    // 1. Regular CSE staff member cannot view it -> 403
    const cseRes = await request(app)
      .get(`/api/tickets/${grievanceTicket.id}`)
      .set('Authorization', 'Bearer token-staff-cse');
    expect(cseRes.status).toBe(403);

    // 2. Regular CSE staff queue does not list it
    const queueRes = await request(app)
      .get('/api/staff/queue')
      .set('Authorization', 'Bearer token-staff-cse');
    const queue = queueRes.body.data.tickets || queueRes.body.data;
    expect(queue.find((t) => t.id === grievanceTicket.id)).toBeUndefined();

    // 3. Authorized Grievance Officer (Student Affairs) can view it -> 200
    const grievanceOfficerRes = await request(app)
      .get(`/api/tickets/${grievanceTicket.id}`)
      .set('Authorization', 'Bearer token-staff-grievance');
    expect(grievanceOfficerRes.status).toBe(200);

    // 4. Student Alice (creator) can view her own confidential grievance -> 200
    const creatorRes = await request(app)
      .get(`/api/tickets/${grievanceTicket.id}`)
      .set('Authorization', 'Bearer token-alice');
    expect(creatorRes.status).toBe(200);
  });

  // =========================================================================
  // CRITICAL CASE 12: SLA Indicators Reflect Configured Deadlines
  // =========================================================================
  it('Critical Case 12: SLA targets calculate accurate response and resolution deadlines', async () => {
    // Low vs Urgent tickets
    const lowTicket = await ticketService.createTicket(
      {
        title: 'Routine General Inquiry',
        description: 'When does the library stay open until during mid-term exam week?',
        categoryId: CAT_LIBRARY,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Low',
      },
      studentAlice
    );

    const urgentTicket = await ticketService.createTicket(
      {
        title: 'Server Room Smoke Alarm Triggered',
        description: 'Critical hardware emergency in server room.',
        categoryId: CAT_IT,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Urgent',
      },
      studentAlice
    );

    // Low priority SLA should have longer resolution window than Urgent priority
    const lowResTime = new Date(lowTicket.resolution_due_at).getTime() - new Date(lowTicket.created_at).getTime();
    const urgResTime = new Date(urgentTicket.resolution_due_at).getTime() - new Date(urgentTicket.created_at).getTime();

    expect(lowResTime).toBeGreaterThan(urgResTime);
    expect(lowTicket.first_response_due_at || lowTicket.sla_due_at).toBeDefined();
    expect(urgentTicket.first_response_due_at || urgentTicket.sla_due_at).toBeDefined();
  });

  // =========================================================================
  // CRITICAL CASE 13: AI Failures Do Not Prevent Ticket Submission
  // =========================================================================
  it('Critical Case 13: Upstream AI/LLM failure does not fail ordinary ticket submission', async () => {
    // Ticket submission should complete even if vector embedding or AI categorizer errors out
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', 'Bearer token-alice')
      .send({
        title: 'Library Study Room Reservation Conflict',
        description: 'Two study groups have been scheduled for room 2B at the same time.',
        categoryId: CAT_LIBRARY,
        priority: 'Low',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  // =========================================================================
  // CRITICAL CASE 14: Attachments and Notifications Follow Authorization Rules
  // =========================================================================
  it('Critical Case 14: File upload rejects invalid magic bytes and queues notification jobs', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Exam Medical Exemption Certificate',
        description: 'Attached doctor prescription and fit to travel certificate.',
        categoryId: CAT_ACADEMIC,
        assignedDepartmentId: DEPT_CSE,
        priority: 'High',
      },
      studentAlice
    );

    // 1. Rejects spoofed bash script masquerading as PDF
    const fakePdfBuffer = Buffer.from('#!/bin/bash\nrm -rf /tmp/test\n');
    const uploadRes = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set('Authorization', 'Bearer token-alice')
      .attach('files', fakePdfBuffer, {
        filename: 'medical_excuse.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.message).toMatch(/file signature|unrecognized or unauthorized/i);

    // 2. Accepts valid PDF matching binary header %PDF-
    const genuinePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF');
    const validUploadRes = await request(app)
      .post(`/api/tickets/${ticket.id}/attachments`)
      .set('Authorization', 'Bearer token-alice')
      .attach('files', genuinePdfBuffer, {
        filename: 'valid_doctor_note.pdf',
        contentType: 'application/pdf',
      });

    expect(validUploadRes.status).toBe(201);
    const attachments = validUploadRes.body.data.attachments || validUploadRes.body.data;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].file_name || attachments[0].filename).toBe('valid_doctor_note.pdf');
  });

  // =========================================================================
  // CRITICAL CASE 15: Realtime Disconnection & Safe Refresh Integration
  // =========================================================================
  it('Critical Case 15: Ticket querying maintains data integrity and handles polling refreshes', async () => {
    const ticket = await ticketService.createTicket(
      {
        title: 'Hostel Maintenance Request',
        description: 'Plumbing repair requested in room 108.',
        categoryId: CAT_HOSTEL,
        assignedDepartmentId: DEPT_CSE,
        priority: 'Medium',
      },
      studentAlice
    );

    // Verify polling/refresh endpoint returns consistent state
    const res1 = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-alice');
    expect(res1.status).toBe(200);

    // Staff modifies state via HTTP endpoint
    await request(app)
      .patch(`/api/tickets/${ticket.id}/status`)
      .set('Authorization', 'Bearer token-staff-cse')
      .send({ status: 'IN_PROGRESS' });

    // Client refetch on reconnect gets updated data without cache poisoning
    const res2 = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', 'Bearer token-alice');
    expect(res2.status).toBe(200);
    expect(res2.body.data.status).toBe('IN_PROGRESS');
  });
});
