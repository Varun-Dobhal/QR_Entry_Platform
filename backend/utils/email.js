const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const BULK_BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1500;

const DRIVE_LINK =
  "https://drive.google.com/file/d/1Ub73iPyrnTLPUwytr4GQV311u-7emDjd/view?usp=sharing";

const sendQrEmail = async (attendee, qrCodeDataUrl, customMessage = "") => {
  try {
    if (!attendee.email) {
      console.log(`[SKIP_EMAIL] ${attendee.roll} has no email`);

      return {
        success: false,
        email: attendee.email,
      };
    }

    const messageHtml = customMessage
      ? `
        <div style="
          background:#EEF2FF;
          padding:18px;
          border-radius:14px;
          margin-bottom:24px;
          border-left:5px solid #4F46E5;
          color:#3730A3;
          font-size:15px;
          line-height:1.7;
          white-space:pre-wrap;
          word-break:break-word;
        ">
          ${customMessage}
        </div>
      `
      : "";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
      </head>

      <body style="
        margin:0;
        padding:20px;
        background:#f3f4f6;
        font-family:Arial,sans-serif;
      ">

      <div style="
        max-width:600px;
        margin:auto;
        background:#ffffff;
        border-radius:24px;
        overflow:hidden;
        border:1px solid #e5e7eb;
      ">

        <!-- HEADER -->

        <div style="
          background:#111827;
          padding:40px 30px;
          text-align:center;
        ">

          <h1 style="
            margin:0;
            color:white;
            font-size:30px;
            font-weight:800;
            line-height:1.4;
          ">
            स्मृति संचय<br>
            B.Tech CSE 2026 Farewell Celebration
          </h1>

          <p style="
            color:#D1D5DB;
            margin-top:14px;
            font-size:16px;
          ">
            Official Entry Pass
          </p>

        </div>

        <!-- BODY -->

        <div style="padding:35px;">

          <h2 style="
            margin-top:0;
            color:#111827;
            font-size:28px;
            text-align:center;
          ">
            Hello, ${attendee.name}!
          </h2>

          <p style="
            text-align:center;
            color:#6B7280;
            font-size:16px;
            margin-bottom:30px;
          ">
            Your Farewell Entry Pass is Ready
          </p>

          ${messageHtml}

          <!-- QR SECTION -->


          <!-- ACCESS LINK -->


          <!-- DOCUMENT SECTION -->

          <div style="
            background:#EFF6FF;
            padding:22px;
            border-radius:16px;
            margin-bottom:30px;
            border-left:5px solid #2563EB;
          ">

            <h3 style="
              margin-top:0;
              color:#1D4ED8;
              font-size:20px;
            ">
              Important Event Information
            </h3>

            <p style="
              color:#374151;
              line-height:1.7;
              margin-bottom:18px;
            ">
              Please check the official event document before arriving.
            </p>

            <a
              href="${DRIVE_LINK}"
              style="
                display:inline-block;
                background:#2563EB;
                color:white;
                padding:12px 20px;
                border-radius:12px;
                text-decoration:none;
                font-weight:700;
              "
            >
              Open Event Document
            </a>

          </div>

        </div>

        <!-- FOOTER -->

        <div style="
          border-top:1px solid #E5E7EB;
          text-align:center;
          padding:25px;
          background:#FAFAFA;
        ">

          <p style="
            margin:0;
            color:#9CA3AF;
            font-size:13px;
          ">
            © ${new Date().getFullYear()} Graphic Era Farewell
          </p>

        </div>

      </div>

      </body>
      </html>
    `;

    // QR IMAGE
    const base64Image = qrCodeDataUrl.split("base64,")[1];

    // SEND EMAIL
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM,

      to: attendee.email,

      subject: "Your Farewell Entry QR Code",

      html: htmlContent,

      attachments: [
        {
          filename: "qrcode.png",
          content: base64Image,
          encoding: "base64",
          content_id: "qrcode",
          disposition: "inline",
        },
      ],
    });

    console.log(`[EMAIL_SENT] ${attendee.email}`);

    return {
      success: true,
      email: attendee.email,
      response,
    };
  } catch (error) {
    console.error(`[EMAIL_FAILED] ${attendee.email}`, error);

    return {
      success: false,
      email: attendee.email,
      error: error.message,
    };
  }
};

const sendBulkQrEmails = async (
  attendees,
  qrGeneratorFunction,
  customMessage = "",
) => {
  const results = [];

  console.log(`Starting bulk email sending to ${attendees.length} attendees`);

  for (let i = 0; i < attendees.length; i += BULK_BATCH_SIZE) {
    const batch = attendees.slice(i, i + BULK_BATCH_SIZE);

    console.log(`Processing batch ${Math.floor(i / BULK_BATCH_SIZE) + 1}`);

    const batchResults = await Promise.all(
      batch.map(async (attendee) => {
        try {
          const qrCodeDataUrl = await qrGeneratorFunction(attendee);

          return await sendQrEmail(attendee, qrCodeDataUrl, customMessage);
        } catch (err) {
          console.error(
            `[QR_GENERATION_FAILED] ${attendee.email}`,
            err.message,
          );

          return {
            success: false,
            email: attendee.email,
            error: err.message,
          };
        }
      }),
    );

    results.push(...batchResults);

    // DELAY BETWEEN BATCHES
    if (i + BULK_BATCH_SIZE < attendees.length) {
      console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);

      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const successCount = results.filter((r) => r.success).length;

  const failedCount = results.filter((r) => !r.success).length;

  console.log(`
========================================
BULK EMAIL SUMMARY
========================================

Total: ${attendees.length}
Success: ${successCount}
Failed: ${failedCount}

========================================
`);

  return results;
};

module.exports = {
  sendQrEmail,
  sendBulkQrEmails,
};
