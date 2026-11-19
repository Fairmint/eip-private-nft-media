export class AuthorizationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "AuthorizationError";
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map