

// Simplified layout for Landing. No firebase imports needed here!
export const useAuth = () => {
  // A simple mock for useAuth used in Landing Pages
  // You could decode a JWT from localStorage if you wanted to detect logged-in users
  return { firebaseUser: null, currentUser: null, loading: false };
};
