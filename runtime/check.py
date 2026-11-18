"""Read bounded syntax evidence using the standard Python AST. Never import project code."""
import ast
import json
import sys


def dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return dotted(node.value) + "." + node.attr
    raise ValueError("computed-name")


def registrations(module, binding):
    imports, receivers, result = {}, set(), []
    bound = set()
    def bind(name):
        if name in bound:
            raise ValueError("rebound-name")
        bound.add(name)

    for node in module.body:
        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            for alias in node.names:
                if alias.name == "*":
                    raise ValueError("wildcard-import")
                bind(alias.asname or alias.name)
                imports[alias.asname or alias.name] = node.module + "." + alias.name
        elif isinstance(node, ast.Import):
            for alias in node.names:
                bind(alias.asname or alias.name.split(".")[0])
                imports[alias.asname or alias.name.split(".")[0]] = alias.name if alias.asname else alias.name.split(".")[0]
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            continue
        elif isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            call = node.value
            parts = dotted(call.func).split(".")
            origin = ".".join([imports.get(parts[0], ""), *parts[1:]])
            if origin != binding["constructor"] or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
                raise ValueError("unknown-assignment")
            if call.keywords or any(not isinstance(arg, ast.Constant) or not isinstance(arg.value, str) for arg in call.args):
                raise ValueError("constructor-options")
            bind(node.targets[0].id)
            receivers.add(node.targets[0].id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            bind(node.name)
            for dec in node.decorator_list:
                if not isinstance(dec, ast.Call) or not isinstance(dec.func, ast.Attribute) or not isinstance(dec.func.value, ast.Name):
                    raise ValueError("unknown-decorator")
                if dec.func.value.id not in receivers or dec.func.attr not in binding["methods"]:
                    raise ValueError("unknown-registration")
                if binding["fact"] == "routes":
                    if len(dec.args) != 1 or not isinstance(dec.args[0], ast.Constant) or not isinstance(dec.args[0].value, str):
                        raise ValueError("literal-path-required")
                    if dec.keywords:
                        raise ValueError("decorator-options")
                    result.append({"method": binding["methods"][dec.func.attr], "path": dec.args[0].value})
                elif binding["fact"] == "tools" and not dec.args and not dec.keywords:
                    result.append({"name": node.name})
                else:
                    raise ValueError("unsupported-registration")
        else:
            raise ValueError("unsupported-top-level-statement")
    return result


def check(data):
    modules = {f["path"]: ast.parse(f["content"], filename=f["path"])
               for f in data["files"] if f["path"].endswith((".py", ".pyi"))}
    facts = {}
    readers = {}
    for pack in data["rules"]:
        reader = pack["rules"].get("bindings", {}).get("python.decorated-object/v1")
        if reader:
            key = reader["capability"]
            if key in readers and readers[key] != reader:
                raise ValueError("conflicting-bindings")
            readers[key] = reader
    for pack in data["rules"]:
        required = pack["rules"]["requires"]
        if required == ["source.declarations/v1"]:
            rows = [{"kind": "class" if isinstance(node, ast.ClassDef) else "function",
                     "name": node.name, "path": path} for path, module in sorted(modules.items())
                    for node in module.body if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))]
            value = {"declarations": rows}
        else:
            if len(required) != 1 or required[0] not in readers:
                raise ValueError("missing-reader")
            binding = readers[required[0]]
            rows = [row for path in binding["files"] if path in modules
                    for row in registrations(modules[path], binding)]
            key = binding["fact"]
            rows.sort(key=lambda r: (r.get("path", ""), r.get("method", ""), r.get("name", "")))
            value = {key: rows}
        facts[pack["id"]] = {rule["id"]: value for rule in pack["rules"]["checks"]}
    return {"state": "complete", "facts": facts}


def main():
    request = json.load(sys.stdin)
    if request["protocol"] != "lekalo/runtime/v1":
        raise ValueError("protocol")
    op = request["operation"]
    if op == "describe":
        result = {"id": "lekalo-python", "version": "0.2.0", "operations": ["check", "target.version"],
                  "rules_api": ["lekalo/contract-rules/v1"], "capabilities": ["source.declarations/v1", "http.routes/v1", "mcp.tools/v1"]}
    elif op == "target.version":
        version = request["input"]["version"]
        result = {"version": version, "supported": version in [".".join(map(str, sys.version_info[:n])) for n in (2, 3)]}
    elif op == "check":
        try:
            result = check(request["input"])
        except (ValueError, TypeError, SyntaxError, KeyError, RecursionError):
            result = {"state": "partial", "facts": {}}
    else:
        raise ValueError("operation")
    json.dump({"protocol": request["protocol"], "request_id": request["request_id"], "result": result}, sys.stdout)


if __name__ == "__main__":
    main()
