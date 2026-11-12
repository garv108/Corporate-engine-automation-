export type ApprovalState = {
  type: string;
  founderApproved: boolean;
  affectedApproved: boolean;
};

export function requiresAffectedPersonApproval(type: string) {
  return type === "Collaborates with" || type === "Stakeholder of";
}

export function isRelationshipApproved(state: ApprovalState) {
  return state.founderApproved && (!requiresAffectedPersonApproval(state.type) || state.affectedApproved);
}
