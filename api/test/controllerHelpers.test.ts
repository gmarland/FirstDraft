import assert from "node:assert/strict";
import { normalizeEnabledTaskTypes } from "../src/commandModes.js";
import { readUpdateProfileInput, validateUpdateProfileInput, validateUserInput } from "../src/controllers/auth/authValidation.js";
import { getMissingSkills, parseCommandMode, parseGitflowPayload, readTaskQueueSort, readTaskQueueStatuses, readWorkerEnabled } from "../src/controllers/workers/workerRequests.js";

function testAuthValidation(): void {
  assert.equal(validateUserInput("", "password123"), "email is required");
  assert.equal(validateUserInput("user@example.com", ""), "password is required");
  assert.equal(validateUserInput("user@example.com", "short"), "password must be at least 8 characters");
  assert.equal(validateUserInput("user@example.com", "password123"), undefined);
  assert.equal(validateUpdateProfileInput(readUpdateProfileInput({ email: "" })), "email is required");
  assert.equal(validateUpdateProfileInput(readUpdateProfileInput({ password: "short" })), "password must be at least 8 characters");
  assert.equal(validateUpdateProfileInput(readUpdateProfileInput({ email: "user@example.com" })), undefined);
  assert.equal(validateUpdateProfileInput(readUpdateProfileInput({ email: "user@example.com", password: "password123" })), undefined);
}

function testWorkerRequests(): void {
  assert.equal(parseCommandMode(undefined), "ai");
  assert.equal(parseCommandMode("shell"), "shell");
  assert.equal(parseCommandMode("invalid"), undefined);
  assert.deepEqual(parseGitflowPayload('{"repositoryUrl":" repo ","sourceBranch":" feature ","targetBranch":" main "}'), {
    repositoryUrl: "repo",
    sourceBranch: "feature",
    targetBranch: "main"
  });
  assert.equal(parseGitflowPayload("{"), undefined);
  assert.deepEqual(getMissingSkills(["Git"], "gitflow"), []);
  assert.deepEqual(getMissingSkills([], "gitflow"), ["git"]);
  assert.deepEqual(normalizeEnabledTaskTypes(undefined), ["ai", "shell", "gitflow"]);
  assert.deepEqual(normalizeEnabledTaskTypes("gitflow|ai|unknown|ai"), ["gitflow", "ai"]);
  assert.deepEqual(normalizeEnabledTaskTypes(["shell", "AI"]), ["shell", "ai"]);
  assert.equal(readWorkerEnabled({ enabled: true }), true);
  assert.equal(readWorkerEnabled({ enabled: false }), false);
  assert.equal(readWorkerEnabled({ enabled: "false" }), undefined);
  assert.deepEqual(readTaskQueueStatuses({}), ["queued", "in_progress"]);
  assert.deepEqual(readTaskQueueStatuses({ status: ["completed", "failed"] }), ["completed", "failed"]);
  assert.deepEqual(readTaskQueueStatuses({ status: ["queued", "invalid", "queued", "completed"] }), ["queued", "completed"]);
  assert.deepEqual(readTaskQueueStatuses({ status: ["invalid"] }), ["queued", "in_progress"]);
  assert.deepEqual(readTaskQueueSort({}), {});
  assert.deepEqual(readTaskQueueSort({ sortBy: "task", sortDirection: "asc" }), { sortBy: "task", sortDirection: "asc" });
  assert.deepEqual(readTaskQueueSort({ sortBy: "created", sortDirection: "desc" }), { sortBy: "created", sortDirection: "desc" });
  assert.deepEqual(readTaskQueueSort({ sortBy: "invalid", sortDirection: "desc" }), {});
  assert.deepEqual(readTaskQueueSort({ sortBy: "task", sortDirection: "invalid" }), {});
}

testAuthValidation();
testWorkerRequests();

console.log("controller helper tests passed");
