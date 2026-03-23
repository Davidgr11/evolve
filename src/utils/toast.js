import { toast as hotToast } from 'react-hot-toast';

// Single ID ensures only one toast is visible at a time — new ones replace old ones.
const ID = 'app-toast';

const success = (msg, opts = {}) => hotToast.success(msg, { id: ID, ...opts });
const error   = (msg, opts = {}) => hotToast.error(msg,   { id: ID, ...opts });
const show    = (msg, opts = {}) => hotToast(msg,          { id: ID, ...opts });

const toast = Object.assign(show, hotToast, { success, error });

export default toast;
