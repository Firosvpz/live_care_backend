import User_usecase from "../../usecases/user_usecase";
import { Request, Response, NextFunction } from "express";

class User_controller {
  constructor(private user_case: User_usecase) {}

  async verify_user_email(req: Request, res: Response, next: NextFunction) {
    try {
      const user_info = req.body;
      const response = await this.user_case.find_user(user_info);

      if (response?.status === 200) {
        throw new Error("User already exists");
      }

      if (response?.status === 201) {
        const token = response.data;
        return res.status(201).json({
          success: true,
          token,
          message: "OTP generated and send",
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async verify_otp(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract token from authorization header
      const auth_header = req.headers.authorization;
      if (!auth_header) {
        return res
          .status(401)
          .json({ success: false, message: " Authorization header missing" });
      }

      const token = req.headers.authorization?.split(" ")[1] as string;
      if (!token) {
        return res.status(401).json({
          success: false,
          message: " Token missing from autherization header",
        });
      }

      // Extract OTP from request body
      const { otp } = req.body;
      console.log(otp);
      if (!otp) {
        return res
          .status(400)
          .json({ success: false, message: " Otp is required " });
      }

      const save_user = await this.user_case.create_user(token, otp);

      if (save_user.success) {
        res.cookie("userToken", save_user.token, {
          httpOnly: true, // Prevent JavaScript access to the cookie
          secure: process.env.NODE_ENV === "production", // Use HTTPS in production
          sameSite: "strict", // Prevent CSRF attacks
        });
      } else {
        res.status(400).json({ success: false, message: "OTP not verified" });
      }

      return res.status(200).json({
        success: true,
        token: save_user.token,
        message: " OTP verified successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async verify_login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const user = await this.user_case.user_login(email, password);

      if (user?.success) {
        res.cookie("userToken", user.data?.access_token, {
          expires: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          httpOnly: true,
          secure: true, // use true if you're serving over https
          sameSite: "none", // allows cross-site cookie usage
        });

        // Include the refresh token in the response if necessary
        res.status(200).json({
          success: true,
          message: "Login successful",
          access_token: user.data?.access_token,
          refresh_token: user.data?.refresh_token,
        });
      } else {
        res.status(401).json({ success: false, message: "Login failed" });
      }
    } catch (error) {
      next(error);
    }
  }

  async home(req: Request, res: Response, next: NextFunction) {
    try {
      const welcomeMessage = "Welcome to the home page!";

      return res
        .status(200)
        .json({ success: true, data: { message: welcomeMessage } });
    } catch (error) {
      next(error);
    }
  }
}
export default User_controller;
