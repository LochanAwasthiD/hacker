
///nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "lochanawasthi22@gmail.com", // any Gmail account
    pass: "coqu zgna vsyb cuew", // generated from Google Security → App passwords
  },
});

//  Notify site owner
  transporter.sendMail(
    {
      from: "lochanawasthi22@gmail.com",       // must match auth.user
      to: "studioOwner@gmail.com",             // replace with your own inbox
      subject: "📸 New Booking Request",
      text: `${newReview.name} wants to book a ${newReview.session} session.
             Contact: ${newReview.email}, ${newReview.phone}`,
    },
    (err, info) => {
      if (err) {
        console.error("Error sending owner email:", err);
      } else {
        console.log("Owner email sent:", info.response);
      }
    }
  );

  //  Confirmation back to the client
  transporter.sendMail(
    {
      from: "lochanawasthi22@gmail.com",
      to: newReview.email,                    // client’s email from form
      subject: "Thanks for booking with Astryne Studio",
      text: `Hi ${newReview.name}, thanks for booking a ${newReview.session} session.
             We’ll get back to you soon!`,
    },
    (err, info) => {
      if (err) {
        console.error(" Error sending confirmation:", err);
      } else {
        console.log("Confirmation email sent to client:", info.response);
      }
    }
  );