// Subscription tiers and feature entitlements.
// Features ask `can("voiceFollow")` instead of checking plan names, so billing
// can be switched on later by changing only where the current plan comes from.

export const PLANS = {
  free: {
    name: "Free",
    limits: { scripts: 3 },
    features: ["autoScroll", "manualScroll", "mirror", "import", "shareLink"],
  },
  pro: {
    name: "Pro",
    limits: { scripts: Infinity },
    features: ["autoScroll", "manualScroll", "mirror", "import", "shareLink",
      "voiceFollow", "cloudSync", "remoteControl", "cameraMode", "cloudImport"],
  },
  team: {
    name: "Team",
    limits: { scripts: Infinity },
    features: ["autoScroll", "manualScroll", "mirror", "import", "shareLink",
      "voiceFollow", "cloudSync", "remoteControl", "cameraMode", "cloudImport",
      "workspaces", "operatorMode", "broadcast"],
  },
};

// Single-user mode: the local owner gets everything that is built.
// Phase 2 replaces this with the signed-in account's plan.
let currentPlan = "pro";

export function setPlan(id) {
  if (PLANS[id]) currentPlan = id;
}

export function plan() {
  return { id: currentPlan, ...PLANS[currentPlan] };
}

export function can(feature) {
  return PLANS[currentPlan].features.includes(feature);
}

export function limit(name) {
  return PLANS[currentPlan].limits[name];
}
