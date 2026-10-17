// Temporary release operator permanently retired after controlled acceptance cleanup.
// No Auth-admin client, credentials, provisioning or recovery capability remains.
export function handler() {
 return Response.json({error:'OPERATOR_RETIRED'},{status:410,headers:{'Cache-Control':'no-store'}});
}
Deno.serve(handler);
