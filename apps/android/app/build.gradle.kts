plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from CI secrets when they're set (stable key: phones can update in place).
// Without them the APK is signed with the debug key, which installs fine but can't update an
// install signed by a different key.
val keystorePath: String? = System.getenv("JOTR_KEYSTORE")
val jotrVersion: String = System.getenv("JOTR_VERSION") ?: "0.1.0"

android {
    namespace = "app.jotr.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.jotr.android"
        minSdk = 26 // Android 8: floating windows over other apps
        targetSdk = 35
        versionName = jotrVersion
        versionCode = jotrVersion.split(".").map { it.filter(Char::isDigit).ifEmpty { "0" }.toInt() }
            .let { (it + listOf(0, 0, 0)).take(3) }
            .let { it[0] * 10000 + it[1] * 100 + it[2] }
            .coerceAtLeast(1)
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("JOTR_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("JOTR_KEY_ALIAS")
                keyPassword = System.getenv("JOTR_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
