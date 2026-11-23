// One item per contact to draft for, so the Claude node runs once for each.
return $input.first().json.ai.map((a) => ({ json: a }));
