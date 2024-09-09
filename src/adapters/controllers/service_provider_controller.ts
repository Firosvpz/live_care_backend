import ServiceProviderUsecase from "../../usecases/service_provider_usecase";
import { Request, Response, NextFunction } from "express";
import { logger } from "../../infrastructure/utils/combine_log";
import path from "path";
import fs from "fs";

class ServiceProviderController {
  constructor(private spUsecase: ServiceProviderUsecase) {}

  async verifyServiceProviderEmail(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const spInfo = req.body;

      const response = await this.spUsecase.findServiceProvider(spInfo);
      

      if (!response) {
        logger.error("cannot get service provider info");
        return;
      }

      if (response?.status === 200) {
        logger.error("email already exist");
        return;
      }

      if (response?.status === 201) {
        const token = response.data;
        return res.status(201).json({
          success: true,
          data: token,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.split(" ")[1] as string;
      const { otp } = req.body;

      const serviceProvider = await this.spUsecase.saveServiceProvider(
        token,
        otp,
      );
      if (serviceProvider?.success) {
        const { token } = serviceProvider.data;
        res.cookie("serviceProviderToken", token);
        return res
          .status(201)
          .json({ success: true, data: { token }, message: "Otp verified" });
      } else {
        logger.error("OTP not verified", 400);
        return;
      }
    } catch (error) {
      next(error);
    }
  }

  async resendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.split(" ")[1] as string;
      if (!token) {
        logger.error("Unauthorized user", 401);
      }

      const serviceProviderInfo =
        await this.spUsecase.getServiceProviderByToken(token);
      if (!serviceProviderInfo) {
        logger.error("user not found", 404);
      }
      const response =
        await this.spUsecase.findServiceProvider(serviceProviderInfo);

      if (response?.status === 200) {
        logger.error("User already exist", 400);
      }

      if (response?.status === 201) {
        const token = response.data;
        return res.status(201).json({
          success: true,
          token,
        });
      }
    } catch (error) {
      next(error);
    }
  }
  async verifyLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const serviceProvider = await this.spUsecase.serviceProviderLogin(
        email,
        password,
      );
      console.log("sepLog:", serviceProvider);

      if (serviceProvider?.success) {
        res.cookie("serviceProviderToken", serviceProvider.data?.token, {
          expires: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Expires in 2 days
          httpOnly: true,
          secure: true, // use true if you're serving over https
          sameSite: "none", // allows cross-site cookie usage
        });
        res.status(200).json(serviceProvider);
      } else {
        res.status(400).json(serviceProvider);
      }
    } catch (error) {
        console.error('Server error:', error); // Log server errors for debugging
        res.status(500).json({ success: false, message: "An error occurred during login" });
      next(error);
    }
  }

  async verifyDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        email,
        exp_year,
        service,
        specialization,
        qualification,
        rate,
      } = req.body;
      console.log(
        "body",
        name,
        email,
        exp_year,
        specialization,
        service,
        qualification,
        rate,
        req.body,
      );
      console.log("files", req.files);

      const { profile_picture, experience_crt } = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      if (!profile_picture || !experience_crt) {
        logger.error("All files must be uploaded", 400);
      }

      const serviceProviderDetails = {
        ...req.body,
        ...req.files,
        _id: req.serviceProviderId,
      };
      // const serviceProviderId = req.serviceProviderId

      const updatedServiceProvider =
        await this.spUsecase.saveServiceProviderDetails(serviceProviderDetails);
      if (updatedServiceProvider?.success) {
        [profile_picture, experience_crt].forEach((files) => {
          files.forEach((file) => {
            const filepath = path.join(
              __dirname,
              "../../infrastructure/public/images",
              file.filename,
            );
            console.log("filepath", filepath);

            fs.unlink(filepath, (err) => {
              if (err) {
                logger.error("error while deleting files from server ", err);
              }
            });
          });
        });
        return res.status(200).json({
          success: true,
          message: "details verified successfully",
          data: updatedServiceProvider,
        });
      } else {
        logger.error("service provider not found", 404);
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

export default ServiceProviderController;
