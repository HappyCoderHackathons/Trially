export const handler = async (event) => {
    // Auto-confirm the user
    event.response.autoConfirmUser = true;
    // Mark email as verified (optional, helps with password recovery)
    event.response.autoVerifyEmail = true; 
    return event;
};