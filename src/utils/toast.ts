import { Alert } from 'react-native';
import Toast, { ToastShowParams } from 'react-native-toast-message';

export const AppToast = {
  success: (title: string, message?: string, props?: ToastShowParams) => {
    Toast.show({
      type: 'success',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 4000,
      autoHide: true,
      topOffset: 50,
      ...props,
    });
    // Fallback alert just in case it's on a modal
    Alert.alert(title, message || '');
  },

  error: (title: string, message?: string, props?: ToastShowParams) => {
    Toast.show({
      type: 'error',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 5000,
      autoHide: true,
      topOffset: 50,
      ...props,
    });
    Alert.alert(title, message || '');
  },

  info: (title: string, message?: string, props?: ToastShowParams) => {
    Toast.show({
      type: 'info',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 4000,
      autoHide: true,
      topOffset: 50,
      ...props,
    });
    Alert.alert(title, message || '');
  },
};
