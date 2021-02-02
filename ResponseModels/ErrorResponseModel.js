class ErrorResponse {
    constructor(code, message, details = ""){
        this.code = code;
        this.message = message;
        this.details = details;
    }
}

module.exports = ErrorResponse;