const enrollmentService = require('../services/enrollmentService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');
const authzService = require('../services/authzService');
const { AuthorizationError } = require('../utils/errors/errorTypes');

/**
 * Get enrollment stats (overall counts, not paginated)
 * GET /api/enrollments/stats
 */
exports.getEnrollmentStats = catchAsync(async (req, res) => {
  const stats = await enrollmentService.getEnrollmentStats();
  res.status(200).json(successResponse('Enrollment stats retrieved successfully', { stats }));
});

/**
 * Get all enrollments with filters
 * GET /api/enrollments
 */
exports.getEnrollments = catchAsync(async (req, res) => {
  const { status, programId, menteeId, search, page, limit } = req.query;

  // Scope by what the requester may SEE, not by their primary role (a co-mentor
  // has a 'mentee' primary role but legitimately views others). Asking for a
  // specific mentee requires permission to view them; asking broadly with no
  // mentor/admin capability falls back to "your own enrollments only".
  let filters = { status, programId, menteeId, search };
  if (menteeId && menteeId !== req.user.id) {
    const allowed = await authzService.canViewMentee(req.user, menteeId, {
      assignments: req.loadAssignments ? await req.loadAssignments() : undefined
    });
    if (!allowed) throw new AuthorizationError("You cannot view this mentee's enrollments");
  } else {
    const caps = req.loadCapabilities ? await req.loadCapabilities() : [(await req.loadWorkspaceRole())];
    const privileged = caps.includes('mentor') || caps.includes('admin');
    if (!privileged) filters.menteeId = req.user.id;
  }

  // A program_admin sees only their programs' enrollments (org admins: all).
  const programScope = await authzService.adminProgramScope(req.user, {
    assignments: req.loadAssignments ? await req.loadAssignments() : undefined
  });
  if (Array.isArray(programScope) && programScope.length) filters.programIds = programScope;

  const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 20 };

  const result = await enrollmentService.getEnrollments(filters, pagination);
  res.status(200).json(successResponse('Enrollments retrieved successfully', result));
});

/**
 * Get enrollment by ID
 * GET /api/enrollments/:id
 */
exports.getEnrollmentById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const enrollment = await enrollmentService.getEnrollmentById(id);
  res.status(200).json(successResponse('Enrollment retrieved successfully', { enrollment }));
});

/**
 * Create enrollment (mentee enrolls in program)
 * POST /api/enrollments
 */
exports.createEnrollment = catchAsync(async (req, res) => {
  // Admin-initiated enrollment: the target mentee is supplied explicitly.
  const { programId, menteeId } = req.body;
  // A program_admin may only enroll into programs they administer.
  await authzService.assertProgramInScope(req.user, programId);

  const enrollment = await enrollmentService.createEnrollment(programId, menteeId);
  res.status(201).json(successResponse('Enrolled successfully', { enrollment }, 201));
});

/**
 * Update enrollment status
 * PATCH /api/enrollments/:id/status
 */
exports.updateEnrollmentStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, status, req.user.id, (await req.loadWorkspaceRole()));
  res.status(200).json(successResponse('Enrollment status updated', { enrollment }));
});

/**
 * Approve enrollment (admin only)
 * POST /api/enrollments/:id/approve
 */
exports.approveEnrollment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const taskService = require('../services/taskService');
  
  // Approve the enrollment
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, 'approved', req.user.id, (await req.loadWorkspaceRole()));
  
  // Auto-assign Week 1 roadmap tasks to the mentee
  try {
    await taskService.autoAssignWeekTasks(id, 1);
    console.log(`✓ Auto-assigned Week 1 tasks for enrollment ${id}`);
  } catch (error) {
    console.error(`Failed to auto-assign tasks for enrollment ${id}:`, error.message);
    // Don't fail the approval if task assignment fails
  }
  
  res.status(200).json(successResponse('Enrollment approved and Week 1 tasks assigned', { enrollment }));
});

/**
 * Reject enrollment (admin only)
 * POST /api/enrollments/:id/reject
 */
exports.rejectEnrollment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, 'rejected', req.user.id, (await req.loadWorkspaceRole()), reason);
  res.status(200).json(successResponse('Enrollment rejected', { enrollment }));
});

/**
 * Request completion of current level/program (mentee or mentor)
 * POST /api/enrollments/:id/request-completion
 */
exports.requestCompletion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const enrollment = await enrollmentService.requestCompletion(id, req.user.id, (await req.loadWorkspaceRole()));
  res.status(200).json(successResponse('Completion requested - awaiting mentor/admin approval', { enrollment }));
});

/**
 * Approve completion (mentor or admin)
 * POST /api/enrollments/:id/approve-completion
 */
exports.approveCompletion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await enrollmentService.approveCompletion(id, req.user.id, (await req.loadWorkspaceRole()));
  const message = result.hasNextLevel
    ? `Level completed - mentee is ready to be promoted to "${result.nextLevelName}"`
    : 'Program completed - mentee has finished all levels';
  res.status(200).json(successResponse(message, result));
});

/**
 * Reject completion request (mentor or admin)
 * POST /api/enrollments/:id/reject-completion
 */
exports.rejectCompletion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const enrollment = await enrollmentService.rejectCompletion(id, req.user.id, (await req.loadWorkspaceRole()), reason);
  res.status(200).json(successResponse('Completion request rejected - enrollment remains active', { enrollment }));
});

/**
 * Remove enrollment (admin only)
 * DELETE /api/enrollments/:id
 */
exports.removeEnrollment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await enrollmentService.removeEnrollment(id, req.user.id);
  res.status(200).json(successResponse(result.message, {}));
});

module.exports = exports;
