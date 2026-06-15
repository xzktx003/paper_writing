import { getProjectRoot as findProjectRoot } from '../services/projectService.js';
import { buildAnswerAdoptionPackage, buildPaperWorkbenchContext, reviewClaimAgainstEvidence, reviewGeneratedAnswer } from '../services/paperWorkbenchService.js';

export function registerPaperWorkbenchRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot || findProjectRoot;
  fastify.post('/api/projects/:id/writing-workbench/context', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    return await buildPaperWorkbenchContext(projectRoot, {
      ...(request.body || {}),
      projectId: request.params.id,
    });
  });

  fastify.post('/api/projects/:id/writing-workbench/review-answer', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const body = request.body || {};
    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: body.task,
      contextAnswers: body.contextAnswers || body.context,
      evidenceQuery: body.evidenceQuery || body.ragQuery || body.query,
      skillLimit: body.skillLimit,
      evidenceLimit: body.evidenceLimit,
      projectId: request.params.id,
    });
    return {
      review: reviewGeneratedAnswer(body.answer || '', {
        ...context,
        previousReview: body.previousReview,
        expectedEvidencePackFingerprint: body.evidencePackFingerprint || body.expectedEvidencePackFingerprint,
      }),
      context: {
        task: context.task,
        citationPolicy: context.citationPolicy,
        evidencePack: context.evidencePack,
        acceptanceChecklist: context.acceptanceChecklist,
      },
    };
  });

  fastify.post('/api/projects/:id/writing-workbench/claim-review', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const body = request.body || {};
    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: body.task,
      contextAnswers: body.contextAnswers || body.context,
      evidenceQuery: body.evidenceQuery || body.ragQuery || body.query,
      skillLimit: body.skillLimit,
      evidenceLimit: body.evidenceLimit,
      projectId: request.params.id,
    });
    return {
      review: reviewClaimAgainstEvidence(body.claim || '', {
        ...context,
        expectedEvidencePackFingerprint: body.evidencePackFingerprint || body.expectedEvidencePackFingerprint,
      }),
      context: {
        task: context.task,
        citationPolicy: context.citationPolicy,
        evidencePack: context.evidencePack,
      },
    };
  });

  fastify.post('/api/projects/:id/writing-workbench/adoption-package', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const body = request.body || {};
    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: body.task,
      contextAnswers: body.contextAnswers || body.context,
      evidenceQuery: body.evidenceQuery || body.ragQuery || body.query,
      skillLimit: body.skillLimit,
      evidenceLimit: body.evidenceLimit,
      projectId: request.params.id,
    });
    const review = reviewGeneratedAnswer(body.answer || '', {
      ...context,
      previousReview: body.review,
      expectedEvidencePackFingerprint: body.evidencePackFingerprint || body.expectedEvidencePackFingerprint,
    });
    return {
      adoptionPackage: buildAnswerAdoptionPackage({
        answer: body.answer || '',
        review,
        context: {
          ...context,
          contextAnswers: body.contextAnswers || body.context || {},
        },
        targetSection: body.targetSection,
      }),
      context: {
        task: context.task,
        targetSection: context.contextAnswers?.target_section_or_file || context.projectState?.contextAnswers?.target_section_or_file || '',
        citationPolicy: context.citationPolicy,
        evidencePack: context.evidencePack,
      },
    };
  });
}
