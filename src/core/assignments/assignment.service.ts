// src/core/assignments/assignment.service.ts
import { Assignment, AssignmentSubmission } from '../../models/Assignment';
import { Student } from '../../models/Student';
import { Class } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { School } from '../../models/School';
import { UserScope } from '../../middleware/scope.middleware';
import { Notifier } from '../../services/notifier.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../middleware/error.middleware';
import { oid, optOid, optDate, text, pageParams } from '../../utils/validate';

function cleanAttachments(input: any): Array<{ name: string; url: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 10)
    .map((a: any) => ({ name: String(a?.name || 'file').slice(0, 150), url: String(a?.url || '') }))
    .filter((a) => a.url.startsWith('/uploads/') || /^https:\/\//i.test(a.url));
}

function assertCanSet(scope: UserScope, classId: string, subjectId: string) {
  if (scope.unrestricted) return;
  const inClass = (scope.classIds || []).includes(String(classId));
  if (scope.role === 'FORM_TEACHER') {
    if (!inClass) throw new ForbiddenError('You can only set assignments for your own class.');
    return;
  }
  if (scope.role === 'SUBJECT_TEACHER') {
    if (!inClass) throw new ForbiddenError('That class is not one of yours.');
    if (!(scope.subjectIds || []).includes(String(subjectId))) {
      throw new ForbiddenError('You can only set assignments for your own subjects.');
    }
    return;
  }
  throw new ForbiddenError('Your role cannot set assignments.');
}

async function loadOwned(schoolId: string, scope: UserScope, id: string) {
  oid(id, 'id');
  const a: any = await Assignment.findOne({ _id: id, schoolId });
  if (!a) throw new NotFoundError('Assignment not found');
  if (!scope.unrestricted && String(a.teacherId) !== scope.userId) {
    const inClass = (scope.classIds || []).includes(String(a.classId));
    if (!(scope.role === 'FORM_TEACHER' && inClass)) throw new ForbiddenError('This is not your assignment.');
  }
  return a;
}

function shape(a: any, extra: any = {}) {
  return {
    id: String(a._id),
    classId: String(a.classId?._id || a.classId),
    className: a.classId?.name,
    subjectId: String(a.subjectId?._id || a.subjectId),
    subjectName: a.subjectId?.name,
    teacherId: String(a.teacherId),
    teacherName: a.teacherName,
    title: a.title,
    instructions: a.instructions || '',
    attachments: a.attachments || [],
    dueDate: a.dueDate || null,
    maxScore: a.maxScore,
    allowLate: a.allowLate,
    status: a.status,
    publishedAt: a.publishedAt || null,
    createdAt: a.createdAt,
    ...extra,
  };
}

export class AssignmentService {
  // ------------------------------------------------------------------
  // Teacher / admin side
  // ------------------------------------------------------------------
  static async list(schoolId: string, scope: UserScope, query: any = {}) {
    const filter: any = { schoolId };
    const classId = optOid(query.classId, 'classId');
    const subjectId = optOid(query.subjectId, 'subjectId');
    if (classId) filter.classId = classId;
    if (subjectId) filter.subjectId = subjectId;
    if (query.status) filter.status = String(query.status).toUpperCase();

    if (!scope.unrestricted) {
      const or: any[] = [{ teacherId: scope.userId }];
      if (scope.role === 'FORM_TEACHER' && scope.classIds?.length) or.push({ classId: { $in: scope.classIds } });
      filter.$or = or;
    } else if (query.mine === 'true') {
      filter.teacherId = scope.userId;
    }

    const { skip, limit } = pageParams(query, 50, 200);
    const rows: any[] = await Assignment.find(filter)
      .populate('classId', 'name')
      .populate('subjectId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const counts = await AssignmentSubmission.aggregate([
      { $match: { assignmentId: { $in: rows.map((r) => r._id) } } },
      { $group: { _id: '$assignmentId', submitted: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ['$status', 'GRADED'] }, 1, 0] } } } },
    ]);
    const byId = new Map(counts.map((c: any) => [String(c._id), c]));
    return rows.map((r) =>
      shape(r, {
        submittedCount: byId.get(String(r._id))?.submitted || 0,
        gradedCount: byId.get(String(r._id))?.graded || 0,
      })
    );
  }

  static async getById(schoolId: string, scope: UserScope, id: string) {
    const a = await loadOwned(schoolId, scope, id);
    await a.populate([{ path: 'classId', select: 'name' }, { path: 'subjectId', select: 'name' }]);
    return shape(a.toObject());
  }

  static async create(schoolId: string, scope: UserScope, user: any, data: any) {
    const classId = oid(data?.classId, 'classId');
    const subjectId = oid(data?.subjectId, 'subjectId');
    assertCanSet(scope, classId, subjectId);

    const [cls, subject, school]: any[] = await Promise.all([
      Class.findOne({ _id: classId, schoolId }).select('_id').lean(),
      Subject.findOne({ _id: subjectId, schoolId }).select('_id').lean(),
      School.findById(schoolId).select('currentSessionId currentTermId').lean(),
    ]);
    if (!cls) throw new BadRequestError('Class not found in this school.');
    if (!subject) throw new BadRequestError('Subject not found in this school.');

    const maxScore = data.maxScore === undefined ? 10 : Number(data.maxScore);
    if (!Number.isFinite(maxScore) || maxScore < 0) throw new BadRequestError('maxScore must be a positive number.');

    const a = await Assignment.create({
      schoolId,
      classId,
      subjectId,
      sessionId: school?.currentSessionId || undefined,
      termId: school?.currentTermId || undefined,
      teacherId: scope.userId,
      teacherName: user?.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
      title: text(data.title, 'Title', { max: 200 }),
      instructions: text(data.instructions, 'Instructions', { required: false, max: 10000 }) || undefined,
      attachments: cleanAttachments(data.attachments),
      dueDate: optDate(data.dueDate, 'dueDate'),
      maxScore,
      allowLate: data.allowLate !== false,
      status: 'DRAFT',
    });

    if (data.publish === true) return AssignmentService.publish(schoolId, scope, String(a._id));
    return AssignmentService.getById(schoolId, scope, String(a._id));
  }

  static async update(schoolId: string, scope: UserScope, id: string, data: any) {
    const a: any = await loadOwned(schoolId, scope, id);
    if (data.title !== undefined) a.title = text(data.title, 'Title', { max: 200 });
    if (data.instructions !== undefined) a.instructions = text(data.instructions, 'Instructions', { required: false, max: 10000 });
    if (data.attachments !== undefined) a.attachments = cleanAttachments(data.attachments);
    if (data.dueDate !== undefined) a.dueDate = optDate(data.dueDate, 'dueDate');
    if (data.maxScore !== undefined) {
      const m = Number(data.maxScore);
      if (!Number.isFinite(m) || m < 0) throw new BadRequestError('maxScore must be a positive number.');
      a.maxScore = m;
    }
    if (data.allowLate !== undefined) a.allowLate = !!data.allowLate;
    await a.save();
    return AssignmentService.getById(schoolId, scope, id);
  }

  /** Publish to the class: students and their parents are notified. */
  static async publish(schoolId: string, scope: UserScope, id: string) {
    const a: any = await loadOwned(schoolId, scope, id);
    if (a.status === 'PUBLISHED') return AssignmentService.getById(schoolId, scope, id);
    a.status = 'PUBLISHED';
    a.publishedAt = new Date();
    await a.save();

    const [subject, students]: any[] = await Promise.all([
      Subject.findById(a.subjectId).select('name').lean(),
      Student.find({ schoolId, classId: a.classId, status: 'ACTIVE' }).select('_id').lean(),
    ]);
    const due = a.dueDate ? ` Due ${new Date(a.dueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}.` : '';
    const body = `New ${subject?.name || ''} assignment: ${a.title}.${due}`.replace(/\s+/g, ' ').trim();
    void Notifier.families(schoolId, students.map((s: any) => s._id), {
      title: 'New assignment',
      body,
      sms: body,
      smsSetting: 'smsOnAssignment',
      metadata: { kind: 'ASSIGNMENT', assignmentId: String(a._id) },
    });
    return AssignmentService.getById(schoolId, scope, id);
  }

  static async close(schoolId: string, scope: UserScope, id: string) {
    const a: any = await loadOwned(schoolId, scope, id);
    a.status = 'CLOSED';
    await a.save();
    return AssignmentService.getById(schoolId, scope, id);
  }

  static async remove(schoolId: string, scope: UserScope, id: string) {
    const a: any = await loadOwned(schoolId, scope, id);
    await AssignmentSubmission.deleteMany({ schoolId, assignmentId: a._id });
    await a.deleteOne();
    return { deleted: true, id };
  }

  /** Everyone in the class, with their submission (or "not submitted"). */
  static async submissions(schoolId: string, scope: UserScope, id: string) {
    const a: any = await loadOwned(schoolId, scope, id);
    const [students, subs]: any[] = await Promise.all([
      Student.find({ schoolId, classId: a.classId, status: 'ACTIVE' }).select('firstName lastName fullName admissionNumber').sort({ firstName: 1 }).lean(),
      AssignmentSubmission.find({ schoolId, assignmentId: a._id }).lean(),
    ]);
    const bySid = new Map<string, any>(subs.map((s: any) => [String(s.studentId), s]));
    const rows: any[] = students.map((s: any) => {
      const sub = bySid.get(String(s._id));
      return {
        studentId: String(s._id),
        studentName: s.fullName || `${s.firstName} ${s.lastName}`.trim(),
        admissionNumber: s.admissionNumber,
        submissionId: sub ? String(sub._id) : null,
        status: sub ? sub.status : 'NOT_SUBMITTED',
        submittedAt: sub?.submittedAt || null,
        late: !!sub?.late,
        text: sub?.text || '',
        attachments: sub?.attachments || [],
        score: sub?.score ?? null,
        feedback: sub?.feedback || '',
      };
    });
    return {
      assignment: shape(a.toObject()),
      total: rows.length,
      submitted: rows.filter((r) => r.status !== 'NOT_SUBMITTED').length,
      rows,
    };
  }

  static async grade(schoolId: string, scope: UserScope, id: string, submissionId: string, data: any) {
    const a: any = await loadOwned(schoolId, scope, id);
    oid(submissionId, 'submissionId');
    const sub: any = await AssignmentSubmission.findOne({ _id: submissionId, schoolId, assignmentId: a._id });
    if (!sub) throw new NotFoundError('Submission not found');

    const score = Number(data?.score);
    if (!Number.isFinite(score) || score < 0) throw new BadRequestError('score must be a non-negative number.');
    if (score > a.maxScore) throw new BadRequestError(`score cannot exceed ${a.maxScore}.`);

    sub.score = score;
    sub.feedback = data.feedback ? String(data.feedback).slice(0, 5000) : undefined;
    sub.status = data.returnToStudent ? 'RETURNED' : 'GRADED';
    sub.gradedBy = scope.userId as any;
    sub.gradedAt = new Date();
    await sub.save();

    void Notifier.families(schoolId, [sub.studentId], {
      title: 'Assignment marked',
      body: `"${a.title}" was marked: ${score}/${a.maxScore}.`,
      metadata: { kind: 'ASSIGNMENT_GRADED', assignmentId: String(a._id) },
    });
    return { id: String(sub._id), status: sub.status, score: sub.score, feedback: sub.feedback || '' };
  }

  // ------------------------------------------------------------------
  // Portal side (student + parent)
  // ------------------------------------------------------------------
  static async forStudent(scope: UserScope, studentId: string) {
    const student = await AssignmentService.ownStudent(scope, studentId);
    const rows: any[] = await Assignment.find({
      schoolId: scope.schoolId,
      classId: student.classId,
      status: { $in: ['PUBLISHED', 'CLOSED'] },
    })
      .populate('subjectId', 'name')
      .sort({ dueDate: 1, publishedAt: -1 })
      .limit(200)
      .lean();
    const subs: any[] = await AssignmentSubmission.find({
      schoolId: scope.schoolId,
      studentId,
      assignmentId: { $in: rows.map((r) => r._id) },
    }).lean();
    const bySub = new Map<string, any>(subs.map((s) => [String(s.assignmentId), s]));
    const now = Date.now();
    return rows.map((r) => {
      const sub = bySub.get(String(r._id));
      return shape(r, {
        overdue: !!r.dueDate && new Date(r.dueDate).getTime() < now && !sub,
        submission: sub
          ? {
              id: String(sub._id),
              status: sub.status,
              submittedAt: sub.submittedAt,
              late: sub.late,
              text: sub.text || '',
              attachments: sub.attachments || [],
              score: sub.score ?? null,
              feedback: sub.feedback || '',
            }
          : null,
      });
    });
  }

  static async submit(scope: UserScope, studentId: string, assignmentId: string, data: any) {
    if (scope.role !== 'STUDENT') throw new ForbiddenError('Only the student can submit an assignment.');
    const student = await AssignmentService.ownStudent(scope, studentId);
    oid(assignmentId, 'assignmentId');

    const a: any = await Assignment.findOne({ _id: assignmentId, schoolId: scope.schoolId, classId: student.classId });
    if (!a || a.status === 'DRAFT') throw new NotFoundError('Assignment not found');
    if (a.status === 'CLOSED') throw new BadRequestError('This assignment is closed.');

    const late = !!a.dueDate && Date.now() > new Date(a.dueDate).getTime();
    if (late && !a.allowLate) throw new BadRequestError('The deadline has passed and late work is not accepted.');

    const textAnswer = data?.text ? String(data.text).trim().slice(0, 20000) : '';
    const attachments = cleanAttachments(data?.attachments);
    if (!textAnswer && attachments.length === 0) throw new BadRequestError('Add your answer or attach a file.');

    const existing: any = await AssignmentSubmission.findOne({ assignmentId, studentId });
    if (existing && existing.status === 'GRADED') throw new BadRequestError('This work has already been marked.');

    const sub: any = existing || new AssignmentSubmission({ schoolId: scope.schoolId, assignmentId, studentId });
    sub.text = textAnswer || undefined;
    sub.attachments = attachments;
    sub.submittedAt = new Date();
    sub.late = late;
    sub.status = 'SUBMITTED';
    await sub.save();

    void Notifier.users(
      scope.schoolId,
      [a.teacherId],
      'Assignment submitted',
      `${student.fullName || `${student.firstName} ${student.lastName}`} submitted "${a.title}"${late ? ' (late)' : ''}.`,
      { kind: 'ASSIGNMENT_SUBMITTED', assignmentId: String(a._id) }
    );
    return { id: String(sub._id), status: sub.status, late, submittedAt: sub.submittedAt };
  }

  private static async ownStudent(scope: UserScope, studentId: string) {
    oid(studentId, 'studentId');
    if (!(scope.ownStudentIds || []).includes(String(studentId))) {
      throw new ForbiddenError('You do not have access to this student.');
    }
    const student: any = await Student.findOne({ _id: studentId, schoolId: scope.schoolId, status: { $ne: 'DELETED' } })
      .select('classId firstName lastName fullName')
      .lean();
    if (!student) throw new NotFoundError('Student not found');
    return student;
  }
}
