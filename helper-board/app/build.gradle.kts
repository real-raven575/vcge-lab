plugins {
    id("com.android.application") version "8.7.3"
    kotlin("android") version "2.0.21"
}

android {
    namespace = "com.herdofhelpers.helperboard"
    compileSdk = 35

    defaultConfig {
        // ".proto" keeps the store id free until the real app is ready.
        applicationId = "com.herdofhelpers.helperboard.proto"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.1.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}-proto"
        // Phones (arm64) and the CI emulator (x86_64) only, to keep the model runtime from quadrupling the APK.
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    buildTypes {
        debug { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        // The prototype builds even with lint warnings; lint still runs in CI and its report is uploaded.
        abortOnError = false
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    // Our own core rules, plus the TensorFlow Lite runtime (Apache-2.0) for the offline laughter model (raven575,
    // 11-24). Nothing here can reach the internet; CI fails any build that asks for the internet permission.
    implementation(project(":core"))
    implementation("org.tensorflow:tensorflow-lite:2.16.1")
}
