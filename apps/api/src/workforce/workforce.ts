import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requirePermission, type AuthenticatedPrincipal } from "../auth/auth.js";

const employeeInput = z.object({
  employeeCode: z.string().trim().min(1).max(80).optional(),
  fullName: z.string().trim().min(2).max(160),
  workEmail: z.string().email().max(320).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  managerEmployeeId: z.string().uuid().nullable().optional()
}).strict();
const skillInput = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(100).optional(), proficiency: z.number().int().min(1).max(5),
  evidenceReference: z.string().trim().max(2048).optional(), evidenceNotes: z.string().trim().max(2000).optional()
}).strict();
const taskInput = z.object({
  title: z.string().trim().min(2).max(200), description: z.string().trim().max(4000).optional(),
  departmentId: z.string().uuid().nullable().optional(), assigneeEmployeeId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(["low","medium","high","urgent"]).optional(),
  requiredSkills: z.array(z.object({skillId:z.string().uuid(),minimumProficiency:z.number().int().min(1).max(5).default(1)}).strict()).max(50).optional()
}).strict();
const taskUpdate = z.object({
  title:z.string().trim().min(2).max(200).optional(), description:z.string().trim().max(4000).nullable().optional(),
  status:z.enum(["backlog","todo","in_progress","blocked","done","cancelled"]).optional(),
  priority:z.enum(["low","medium","high","urgent"]).optional(), assigneeEmployeeId:z.string().uuid().nullable().optional(),
  dueAt:z.string().datetime({offset:true}).nullable().optional()
}).strict().refine(v=>Object.keys(v).length>0);

function principal(request:Request,response:Response):AuthenticatedPrincipal|null {
  if(!request.principal){response.status(401).json({error:{code:"UNAUTHENTICATED",message:"Authentication is required"}});return null;}
  return request.principal;
}
function invalid(response:Response,message:string){response.status(400).json({error:{code:"VALIDATION_ERROR",message}});}

export function createWorkforceRouter():ExpressRouter {
 const router=Router();
 router.get("/employees",requirePermission("workforce:employees:read"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;
  const result=await pool.query("SELECT id,employee_code AS \\"employeeCode\\",full_name AS \\"fullName\\",work_email AS \\"workEmail\\",department_id AS \\"departmentId\\",manager_employee_id AS \\"managerEmployeeId\\",employment_status AS \\"employmentStatus\\",created_at AS \\"createdAt\\" FROM employees WHERE tenant_id=$1 ORDER BY full_name,id LIMIT 200",[actor.tenantId]);
  res.json({data:result.rows});
 });
 router.post("/employees",requirePermission("workforce:employees:create"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;const parsed=employeeInput.safeParse(req.body);
  if(!parsed.success)return invalid(res,parsed.error.issues[0]?.message??"Invalid employee");const v=parsed.data;
  try{
   const result=await pool.query("INSERT INTO employees (tenant_id,employee_code,full_name,work_email,department_id,manager_employee_id,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id,employee_code AS \\"employeeCode\\",full_name AS \\"fullName\\",work_email AS \\"workEmail\\",department_id AS \\"departmentId\\",manager_employee_id AS \\"managerEmployeeId\\",employment_status AS \\"employmentStatus\\"",[actor.tenantId,v.employeeCode??null,v.fullName,v.workEmail??null,v.departmentId??null,v.managerEmployeeId??null,actor.subject]);
   await pool.query("INSERT INTO audit_events (tenant_id,actor_type,actor_id,action,resource_type,resource_id,decision,metadata) VALUES ($1,'user',$2,'employee.created','employee',$3,'allowed',$4::jsonb)",[actor.tenantId,actor.subject,result.rows[0].id,JSON.stringify({fullName:v.fullName})]);
   res.status(201).json({data:result.rows[0]});
  }catch(error){if((error as {code?:string}).code==="23505")return res.status(409).json({error:{code:"CONFLICT",message:"Employee code already exists"}});if((error as {code?:string}).code==="23503")return invalid(res,"Department or manager must belong to this organization");throw error;}
 });
 router.get("/employees/:employeeId/skills",requirePermission("workforce:employees:read"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;const id=z.string().uuid().safeParse(req.params.employeeId);if(!id.success)return invalid(res,"Employee ID must be a UUID");
  const result=await pool.query("SELECT s.id AS \\"skillId\\",s.name,s.category,es.proficiency,es.verification_status AS \\"verificationStatus\\",es.evidence_reference AS \\"evidenceReference\\",es.evidence_notes AS \\"evidenceNotes\\",es.verified_by AS \\"verifiedBy\\",es.verified_at AS \\"verifiedAt\\" FROM employee_skills es JOIN workforce_skills s ON s.tenant_id=es.tenant_id AND s.id=es.skill_id WHERE es.tenant_id=$1 AND es.employee_id=$2 ORDER BY s.name",[actor.tenantId,id.data]);
  res.json({data:result.rows});
 });
 router.post("/employees/:employeeId/skills",requirePermission("workforce:skills:record"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;const id=z.string().uuid().safeParse(req.params.employeeId);if(!id.success)return invalid(res,"Employee ID must be a UUID");
  const parsed=skillInput.safeParse(req.body);if(!parsed.success)return invalid(res,parsed.error.issues[0]?.message??"Invalid skill");const v=parsed.data;
  try{
   const result=await pool.query("WITH skill AS (INSERT INTO workforce_skills (tenant_id,name,description,category) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id) INSERT INTO employee_skills (tenant_id,employee_id,skill_id,proficiency,verification_status,evidence_reference,evidence_notes,recorded_by) SELECT $1,$5,skill.id,$6,'self_reported',$7,$8,$9 FROM skill RETURNING skill_id AS \\"skillId\\",proficiency,verification_status AS \\"verificationStatus\\"",[actor.tenantId,v.name,v.description??null,v.category??null,id.data,v.proficiency,v.evidenceReference??null,v.evidenceNotes??null,actor.subject]);
   res.status(201).json({data:result.rows[0]});
  }catch(error){if((error as {code?:string}).code==="23503")return res.status(404).json({error:{code:"NOT_FOUND",message:"Employee or skill not found in this organization"}});if((error as {code?:string}).code==="23505")return res.status(409).json({error:{code:"CONFLICT",message:"Employee already has this skill"}});throw error;}
 });
 router.get("/tasks",requirePermission("workforce:tasks:read"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;
  const result=await pool.query("SELECT id,title,description,status,priority,department_id AS \\"departmentId\\",assignee_employee_id AS \\"assigneeEmployeeId\\",due_at AS \\"dueAt\\",created_by AS \\"createdBy\\",created_at AS \\"createdAt\\" FROM workforce_tasks WHERE tenant_id=$1 ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,due_at NULLS LAST,created_at DESC LIMIT 200",[actor.tenantId]);
  res.json({data:result.rows});
 });
 router.post("/tasks",requirePermission("workforce:tasks:create"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;const parsed=taskInput.safeParse(req.body);if(!parsed.success)return invalid(res,parsed.error.issues[0]?.message??"Invalid task");const v=parsed.data;const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const created=await client.query("INSERT INTO workforce_tasks (tenant_id,title,description,department_id,assignee_employee_id,due_at,priority,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,title,description,status,priority,department_id AS \\"departmentId\\",assignee_employee_id AS \\"assigneeEmployeeId\\",due_at AS \\"dueAt\\"",[actor.tenantId,v.title,v.description??null,v.departmentId??null,v.assigneeEmployeeId??null,v.dueAt??null,v.priority??"medium",actor.subject]);
   for(const skill of v.requiredSkills??[])await client.query("INSERT INTO workforce_task_required_skills (tenant_id,task_id,skill_id,minimum_proficiency) VALUES ($1,$2,$3,$4)",[actor.tenantId,created.rows[0].id,skill.skillId,skill.minimumProficiency]);
   await client.query("INSERT INTO audit_events (tenant_id,actor_type,actor_id,action,resource_type,resource_id,decision,metadata) VALUES ($1,'user',$2,'workforce_task.created','workforce_task',$3,'allowed',$4::jsonb)",[actor.tenantId,actor.subject,created.rows[0].id,JSON.stringify({title:v.title,assigneeEmployeeId:v.assigneeEmployeeId??null})]);
   await client.query("COMMIT");res.status(201).json({data:created.rows[0]});
  }catch(error){await client.query("ROLLBACK");if((error as {code?:string}).code==="23503")return invalid(res,"Department, assignee or required skill must belong to this organization");throw error;}finally{client.release();}
 });
 router.patch("/tasks/:taskId",requirePermission("workforce:tasks:update"),async(req,res)=>{
  const actor=principal(req,res);if(!actor)return;const id=z.string().uuid().safeParse(req.params.taskId);if(!id.success)return invalid(res,"Task ID must be a UUID");
  const parsed=taskUpdate.safeParse(req.body);if(!parsed.success)return invalid(res,parsed.error.issues[0]?.message??"Invalid task update");const v=parsed.data;
  try{
   const result=await pool.query("UPDATE workforce_tasks SET title=COALESCE($3,title),description=CASE WHEN $4::boolean THEN $5 ELSE description END,status=COALESCE($6,status),priority=COALESCE($7,priority),assignee_employee_id=CASE WHEN $8::boolean THEN $9::uuid ELSE assignee_employee_id END,due_at=CASE WHEN $10::boolean THEN $11::timestamptz ELSE due_at END,updated_by=$12 WHERE tenant_id=$1 AND id=$2 RETURNING id,title,description,status,priority,assignee_employee_id AS \\"assigneeEmployeeId\\",due_at AS \\"dueAt\\",updated_at AS \\"updatedAt\\"",[actor.tenantId,id.data,v.title??null,Object.prototype.hasOwnProperty.call(v,"description"),v.description??null,v.status??null,v.priority??null,Object.prototype.hasOwnProperty.call(v,"assigneeEmployeeId"),v.assigneeEmployeeId??null,Object.prototype.hasOwnProperty.call(v,"dueAt"),v.dueAt??null,actor.subject]);
   if(!result.rows[0])return res.status(404).json({error:{code:"NOT_FOUND",message:"Task not found"}});
   await pool.query("INSERT INTO audit_events (tenant_id,actor_type,actor_id,action,resource_type,resource_id,decision,metadata) VALUES ($1,'user',$2,'workforce_task.updated','workforce_task',$3,'allowed',$4::jsonb)",[actor.tenantId,actor.subject,id.data,JSON.stringify({changedFields:Object.keys(v)})]);res.json({data:result.rows[0]});
  }catch(error){if((error as {code?:string}).code==="23503")return invalid(res,"Assignee must belong to this organization");throw error;}
 });
 return router;
}
