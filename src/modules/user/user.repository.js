import User from "./user.model.js";

const userRepository = {
 
  findByEmail: async (email, withPassword = false) => {
    const query = User.findOne({ email });
    if (withPassword) query.select("+password");
    return await query;
  },

  findById: async (id) => {
    return await User.findById(id);
  },

  create: async (userData) => {
    return await User.create(userData);
  },

  updateLastLogin: async (userId) => {
    return await User.findByIdAndUpdate(
      userId,
      { lastLogin: new Date() },
      { new: true }
    );
  },
};

export default userRepository;