class CreateProfileResponse {
    constructor(code, nameArray, accounts){
        this.code = code;
        this.msg = "New User and Account created";
        this.accountNames = nameArray;
        this.accounts = accounts;
    }
}

module.exports = CreateProfileResponse;