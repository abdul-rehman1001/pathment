jest.mock('../../src/db',()=>({models:{PerformanceNomination:{findByPk:jest.fn()},AssignedTask:{findAndCountAll:jest.fn()},Enrollment:{},RoadmapTask:{},TaskSubmission:{},TaskSubmissionFile:{},TaskFeedback:{}}}));
jest.mock('../../src/services/authzService',()=>({hasAdminAccess:jest.fn(),assertProgramInScope:jest.fn()}));
jest.mock('../../src/services/performanceService',()=>({}));
jest.mock('../../src/services/certificateService',()=>({getMentorScopedMenteeClans:jest.fn()}));
const {models}=require('../../src/db');
const authz=require('../../src/services/authzService');
const certificates=require('../../src/services/certificateService');
const service=require('../../src/services/performanceNominationService');
beforeEach(()=>{jest.clearAllMocks();models.PerformanceNomination.findByPk.mockResolvedValue({id:'n',programId:'p',clanId:'c',menteeId:'m'});authz.hasAdminAccess.mockResolvedValue(true);authz.assertProgramInScope.mockResolvedValue(true);});
test('returns actual program-scoped completed work, submission links and feedback in bounded pages',async()=>{
 models.AssignedTask.findAndCountAll.mockResolvedValue({count:42,rows:[{id:'t',titleOverride:'Build API',completedAt:'2026-09-20',submissions:[{submissionText:'My implementation',submissionUrls:['https://example.test/work'],files:[{fileName:'demo.png'}],feedback:[{feedbackText:'Reviewed',rating:5}]}]}]});
 const result=await service.evidence('n',{id:'admin'},2);
 expect(authz.assertProgramInScope).toHaveBeenCalledWith({id:'admin'},'p');
 const query=models.AssignedTask.findAndCountAll.mock.calls[0][0];
 expect(query.where).toEqual({menteeId:'m',status:'completed'});
 expect(query.limit).toBe(10);expect(query.offset).toBe(10);
 expect(query.include[0].where).toEqual({programId:'p'});
 expect(result.pages).toBe(5);expect(result.tasks[0].submission.urls).toEqual(['https://example.test/work']);
 expect(result.tasks[0].submission.feedback[0].feedbackText).toBe('Reviewed');
});
test('rejects a mentor from another clan before loading submissions',async()=>{
 authz.hasAdminAccess.mockResolvedValue(false);certificates.getMentorScopedMenteeClans.mockResolvedValue(['other']);
 await expect(service.evidence('n',{id:'outsider'})).rejects.toThrow('outside your clans');
 expect(models.AssignedTask.findAndCountAll).not.toHaveBeenCalled();
});
test('rejects an admin outside the program scope',async()=>{
 authz.assertProgramInScope.mockRejectedValue(new Error('Outside scope'));
 await expect(service.evidence('n',{id:'scoped-admin'})).rejects.toThrow('Outside scope');
 expect(models.AssignedTask.findAndCountAll).not.toHaveBeenCalled();
});
