import IUserRepository from "../interfaces/repositories/IUser_repository";
import IGenerateOtp from "../interfaces/utils/IGenerate_otp";
import IHashPassword from "../interfaces/utils/IHash_password";
import IJwtToken from "../interfaces/utils/IJwt_token";
import IMailService from "../interfaces/utils/IMail_service";
import IUser from "../domain/entities/user";
import { logger } from "../infrastructure/utils/combine_log";
import IService_provider from "../domain/entities/service_provider";
import IFileStorageService from "../interfaces/utils/IFile_storage_service";
import IGoogleAuthService from "../interfaces/utils/IGoogleAuth";
import { IComplaint } from "../infrastructure/database/complaintModel";
import { IReview } from "../domain/entities/service_provider";

// type DecodedToken = {
//   info: { userId: string };
//   otp: string;
//   iat: number;
//   exp: number;
// }

class UserUsecase {
  constructor(
    private userRepository: IUserRepository,
    private generateOtp: IGenerateOtp,
    private hashPassword: IHashPassword,
    private jwtToken: IJwtToken,
    private mailService: IMailService,
    private fileStorage: IFileStorageService,
    private googleAuthService: IGoogleAuthService,
  ) {}

  async findUser(userInfo: IUser) {
    const user = await this.userRepository.findUserByEmail(userInfo.email);
    if (user) {
      return {
        status: 200,
        data: user,
        message: "found user",
      };
    } else {
      const otp: string = this.generateOtp.generateOtp();
      const token = this.jwtToken.otpToken(userInfo, otp);
      const { name, email } = userInfo;
      await this.mailService.sendMail(name, email, otp);
      return {
        status: 201,
        data: token,
        message: "otp generated and send",
      };
    }
  }

  async getUserInfoUsingToken(token: string) {
    const decodedToken = this.jwtToken.verifyJwtToken(token);
    if (!decodedToken) {
      logger.error("Invalid Token", 400);
      return;
    }
    return decodedToken.info;
  }

  async saveUser(token: string, otp: string) {
    const decodedToken = this.jwtToken.verifyJwtToken(token);
    if (!decodedToken) {
      logger.error("Invalid token");
      return;
    }
    if (otp !== decodedToken.otp) {
      logger.error("Invalid Otp");
      return;
    }

    const { password } = decodedToken.info;
    const hashedPassword = await this.hashPassword.hash(password);
    decodedToken.info.password = hashedPassword;

    const save_user = await this.userRepository.saveUser(decodedToken.info);
    if (!save_user) {
      logger.error("failed to save user");
    }

    const newToken = this.jwtToken.createJwtToken(
      save_user?._id as string,
      "user",
    );
    return {
      success: true,
      token: newToken,
    };
  }

  async userLogin(email: string, password: string) {
    try {
      const user = await this.userRepository.findUserByEmail(email);
      if (!user) {
        logger.error("User not found", 404);
        return {
          success: false,
          message: "User not found",
        };
      }

      const passwordMatch = await this.hashPassword.compare(
        password,
        user.password,
      );
      if (!passwordMatch) {
        logger.error("Password does not match");
        return {
          success: false,
          message: "Incorrect password",
        };
      }

      if (user.is_blocked) {
        logger.error("User is blocked");
        return {
          success: false,
          message: "This user is blocked",
        };
      }

      const token = this.jwtToken.createJwtToken(user._id as string, "user");
      return {
        success: true,
        data: {
          token: token,
          userId: user._id,
        },
        message: "Login successful",
      };
    } catch (error) {
      logger.error("An error occurred during login", error);
      return {
        success: false,
        message: "An error occurred during login",
      };
    }
  }

  async googleLogin(idToken: string) {
    try {
      const payload = await this.googleAuthService.verifyGoogleToken(idToken);

      if (!payload) {
        logger.error("Invalid Google token");
        return {
          success: false,
          message: "Invalid Google token",
        };
      }

      const { sub: googleId, email, name } = payload;
      console.log("id", googleId);
      console.log("emil", email);
      console.log("name", name);

      let user = await this.userRepository.findUserByGoogleId(googleId); // Find user by Google ID
      console.log("googleUesr", user);

      if (user) {
        // If user exists by Google ID, return success
        const token = this.jwtToken.createJwtToken(user._id as string, "user");

        return {
          success: true,
          data: {
            token: token,
            userId: user._id,
            name: user.name,
            email: user.email,
          },
          message: "Google login successful",
        };
      }

      user = await this.userRepository.findUserByEmail(email);
      if (user) {
        // If user exists by email but not by Google ID, associate Google ID with existing user
        user.googleId = googleId; // Update the user to include Google ID
        await user.save(); // Save the updated user

        // Generate JWT token for the user
        const token = this.jwtToken.createJwtToken(user._id as string, "user");

        return {
          success: true,
          data: {
            token: token,
            userId: user._id,
            name: user.name,
            email: user.email,
          },
          message: "Google login successful",
        };
      }

      if (!user) {
        // If the user doesn't exist, create a new one
        user = await this.userRepository.createUser({
          googleId,
          email,
          name,
        });
      } else {
        // If user exists by email but not by Google ID, associate Google ID with existing user
        user.googleId = googleId; // Update the user to include Google ID
        await user.save(); // Save the updated user
      }

      // Generate JWT token for the user
      const token = this.jwtToken.createJwtToken(user._id as string, "user");

      return {
        success: true,
        data: {
          token: token,
          userId: user._id,
          name: user.name,
          email: user.email,
        },
        message: "Google login successful",
      };
    } catch (error) {
      logger.error("An error occurred during Google login", error);
      return {
        success: false,
        message: "An error occurred during Google login",
      };
    }
  }

  async saveUserDetails(userDetails: IUser) {
    const { _id, profile_picture } = userDetails;

    const user = await this.userRepository.findUserById(_id as string);

    if (!user) {
      logger.error("service provider not found", 404);
      return;
    }
    const profilePictureUrl = await this.fileStorage.uploadFile(
      profile_picture,
      "profile_picture",
    );
    console.log("pic:", profilePictureUrl);

    userDetails.profile_picture = profilePictureUrl;
    userDetails.hasCompletedDetails = true;

    const updatedUser = await this.userRepository.saveUserDetails(userDetails);
    if (!updatedUser) {
      logger.error("failed to update user details", 500);
    }

    return {
      success: true,
      message: "user details updated successfully",
      data: updatedUser,
    };
  }

  async getProfileDetails(userId: string) {
    const user = await this.userRepository.findUserById(userId);
    return user;
  }

  async editProfile(userId: string, name: string, phone_number: string) {
    await this.userRepository.editProfile(userId, name, phone_number);
  }

  async editPassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.userRepository.findUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const isPasswordMatch = await this.hashPassword.compare(
      oldPassword,
      user?.password,
    );
    if (!isPasswordMatch) {
      throw new Error(
        "Current password is incorrect. Please check and try again",
      );
    }
    const hashedPassword = await this.hashPassword.hash(newPassword);
    await this.userRepository.updatePassword(userId, hashedPassword);
  }

  async getApprovedAndUnblockedProviders(): Promise<IService_provider[]> {
    return this.userRepository.getApprovedAndUnblockedProviders();
  }

  async ServiceProviderDetails(id: string) {
    const serviceProviderDetails =
      await this.userRepository.getServiceProviderDetails(id);
    return serviceProviderDetails;
  }

  async getListedBlogs(page: number, limit: number) {
    return this.userRepository.getListedBlogs(page, limit);
  }

  getProviderSlotDetails(serviceProviderId: string) {
    const details =
      this.userRepository.getProviderSlotDetails(serviceProviderId);
    return details;
  }

  async getScheduledBookingList(userId: string, page: number, limit: number) {
    try {
      const { bookings, total } =
        await this.userRepository.getScheduledBookings(userId, page, limit);
      return { bookings, total };
    } catch (error) {
      throw new Error("Failed to fetch scheduled bookings");
    }
  }

  async fileComplaint(complaint: Partial<IComplaint>): Promise<IComplaint> {
    return this.userRepository.createComplaint(complaint);
  }

  async getUserComplaints(userId: string): Promise<IComplaint[]> {
    return this.userRepository.getComplaintsByUser(userId);
  }

  async addReview(
    providerId: string,
    userId: string,
    rating: number,
    comment: string,
  ) {
    // console.log('user:',userId,'rating:',rating,"comment:",comment);

    const review: IReview = {
      userId,
      rating,
      comment,
      createdAt: new Date(),
    };
    return this.userRepository.addReview(providerId, review);
  }
}

export default UserUsecase;
